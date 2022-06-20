import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";
import redstone from 'redstone-api';

import VariableUtilisationRatesCalculatorArtifact
  from '../../../artifacts/contracts/VariableUtilisationRatesCalculator.sol/VariableUtilisationRatesCalculator.json';
import ERC20PoolArtifact from '../../../artifacts/contracts/ERC20Pool.sol/ERC20Pool.json';
import CompoundingIndexArtifact from '../../../artifacts/contracts/CompoundingIndex.sol/CompoundingIndex.json';
import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';

import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {WrapperBuilder} from "redstone-evm-connector";
import {
  Asset,
  deployAndInitPangolinExchangeContract,
  fromWei,
  getFixedGasSigners,
  recompileSmartLoanLib,
  toBytes32,
  toWei
} from "../../_helpers";
import {syncTime} from "../../_syncTime"
import {
  CompoundingIndex,
  ERC20Pool, LTVLib,
  MockSmartLoanLogicFacetRedstoneProvider,
  MockSmartLoanLogicFacetRedstoneProvider__factory, MockSmartLoanLogicFacetSetValues,
  MockSmartLoanLogicFacetSetValues__factory,
  OpenBorrowersRegistry__factory,
  PangolinExchange,
  SmartLoansFactory,
  UpgradeableBeacon,
  VariableUtilisationRatesCalculator,
  YieldYakRouter__factory
} from "../../../typechain";
import {BigNumber, Contract} from "ethers";

chai.use(solidity);

const {deployDiamond, deployFacet, replaceFacet} = require('./utils/deploy-diamond');
const {deployContract, provider} = waffle;
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const usdTokenAddress = '0xc7198437980c041c805A1EDcbA50c1Ce5db95118';
const wavaxTokenAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';

const erc20ABI = [
  'function decimals() public view returns (uint8)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function allowance(address owner, address spender) public view returns (uint256)'
]

const wavaxAbi = [
  'function deposit() public payable',
  ...erc20ABI
]

describe('Smart loan - upgrading',  () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe('Check basic logic before and after upgrade', () => {
    let exchange: PangolinExchange,
      loan: MockSmartLoanLogicFacetRedstoneProvider,
      wrappedLoan: any,
      ltvlib: LTVLib,
      smartLoansFactory: SmartLoansFactory,
      wavaxPool: ERC20Pool,
      newWavaxPool: ERC20Pool,
      owner: SignerWithAddress,
      other: SignerWithAddress,
      oracle: SignerWithAddress,
      borrower: SignerWithAddress,
      depositor: SignerWithAddress,
      wavaxTokenContract: Contract,
      usdTokenContract: Contract,
      yakRouterContract: Contract,
      usdTokenDecimalPlaces: BigNumber,
      beacon: UpgradeableBeacon,
      AVAX_PRICE: number,
      USD_PRICE: number,
      MOCK_PRICES: any,
      diamondAddress: any;

    before("should deploy provider, exchange, loansFactory and wavaxPool", async () => {
      diamondAddress = await deployDiamond();
      [owner, oracle, depositor, borrower, other] = await getFixedGasSigners(10000000);

      wavaxTokenContract = new ethers.Contract(wavaxTokenAddress, wavaxAbi, provider);

      const variableUtilisationRatesCalculatorERC20 = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      wavaxPool = (await deployContract(owner, ERC20PoolArtifact)) as ERC20Pool;
      newWavaxPool = (await deployContract(owner, ERC20PoolArtifact)) as ERC20Pool;
      usdTokenContract = new ethers.Contract(usdTokenAddress, erc20ABI, provider);
      exchange = await deployAndInitPangolinExchangeContract(owner, pangolinRouterAddress, [
          new Asset(toBytes32('AVAX'), wavaxTokenAddress),
          new Asset(toBytes32('USD'), usdTokenAddress)
      ]);

      yakRouterContract = await (new YieldYakRouter__factory(owner).deploy());

      usdTokenDecimalPlaces = await usdTokenContract.decimals();

      AVAX_PRICE = (await redstone.getPrice('AVAX')).value;
      USD_PRICE = (await redstone.getPrice('USDT')).value;

      MOCK_PRICES = [
        {
          symbol: 'USD',
          value: USD_PRICE
        },
        {
          symbol: 'AVAX',
          value: AVAX_PRICE
        }
      ];

      smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;

      const borrowersRegistryERC20 = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndexERC20 = (await deployContract(owner, CompoundingIndexArtifact, [wavaxPool.address])) as CompoundingIndex;
      const borrowingIndexERC20 = (await deployContract(owner, CompoundingIndexArtifact, [wavaxPool.address])) as CompoundingIndex;

      await recompileSmartLoanLib(
          'SmartLoanLib',
          [0],
          [wavaxTokenAddress],
          { "AVAX": wavaxPool.address},
          exchange.address,
          yakRouterContract.address,
          'lib'
      );

      // Deploy LTVLib and later link contracts to it
      const LTVLib = await ethers.getContractFactory('LTVLib');
      ltvlib = await LTVLib.deploy() as LTVLib;

      await deployFacet("MockSmartLoanLogicFacetRedstoneProvider", diamondAddress, [], ltvlib.address);

      await smartLoansFactory.initialize(diamondAddress);

      await wavaxPool.initialize(
          variableUtilisationRatesCalculatorERC20.address,
          borrowersRegistryERC20.address,
          depositIndexERC20.address,
          borrowingIndexERC20.address,
          wavaxTokenContract.address
      );

      await wavaxTokenContract.connect(depositor).deposit({value: toWei("1000")});
      await wavaxTokenContract.connect(depositor).approve(wavaxPool.address, toWei("1000"));
      await wavaxPool.connect(depositor).deposit(toWei("1000"));
    });

    it("should create a loan", async () => {
      const wrappedSmartLoansFactory = WrapperBuilder
          .mockLite(smartLoansFactory.connect(borrower))
          .using(
              () => {
                return {
                  prices: MOCK_PRICES,
                  timestamp: Date.now()
                }
              });

      await wrappedSmartLoansFactory.createLoan();

      const loan_proxy_address = await smartLoansFactory.getLoanForOwner(borrower.address);
      const loanFactory = await ethers.getContractFactory("MockSmartLoanLogicFacetRedstoneProvider", {
        libraries: {
          LTVLib: ltvlib.address
        }
      });
      loan = await loanFactory.attach(loan_proxy_address).connect(borrower) as MockSmartLoanLogicFacetRedstoneProvider;
    });


    it("should check if only one loan per owner is allowed", async () => {
      await expect(smartLoansFactory.connect(borrower).createLoan()).to.be.revertedWith("Only one loan per owner is allowed");
      await expect(smartLoansFactory.connect(borrower).createAndFundLoan(toBytes32("AVAX"), 0, 0)).to.be.revertedWith("Only one loan per owner is allowed");
    });


    it("should fund a loan", async () => {
      wrappedLoan = WrapperBuilder
          .mockLite(loan)
          .using(
              () => {
                return {
                  prices: MOCK_PRICES,
                  timestamp: Date.now()
                }
              })

      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(0);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
      expect(await wrappedLoan.getLTV()).to.be.equal(0);

      await wavaxTokenContract.connect(borrower).deposit({value: toWei("2")});
      await wavaxTokenContract.connect(borrower).approve(wrappedLoan.address, toWei("2"));
      await wrappedLoan.fund(toBytes32("AVAX"), toWei("2"));

      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(2 * AVAX_PRICE, 0.1);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
      expect(await wrappedLoan.getLTV()).to.be.equal(0);
    });

    it("should not allow to upgrade from non-owner", async () => {
      const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress)
      await expect(diamondCut.connect(borrower).diamondCut([], ethers.constants.AddressZero, [])).to.be.revertedWith('LibDiamond: Must be contract owner');
    });


    it("should upgrade", async () => {
      await replaceFacet("MockSmartLoanLogicFacetSetValues", diamondAddress, ['setDebt', 'setValue'], ltvlib.address)

      const loanFactory = await ethers.getContractFactory("MockSmartLoanLogicFacetSetValues", {
        libraries: {
          LTVLib: ltvlib.address
        }
      });
      const loan_proxy_address = await smartLoansFactory.getLoanForOwner(borrower.address);
      loan = await loanFactory.attach(loan_proxy_address).connect(owner) as MockSmartLoanLogicFacetSetValues;
      wrappedLoan = WrapperBuilder
          .mockLite(loan)
          .using(
              () => {
                return {
                  prices: MOCK_PRICES,
                  timestamp: Date.now()
                }
              })

      await wrappedLoan.setDebt(777);
      await wrappedLoan.setValue(2137);

      //The mock loan has a hardcoded total value of 777
      expect(await wrappedLoan.getDebt()).to.be.equal(777);
      expect(await wrappedLoan.getTotalValue()).to.be.equal(2137);
    });
  });
});
