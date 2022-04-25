import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";
import redstone from 'redstone-api';

import VariableUtilisationRatesCalculatorArtifact
  from '../../../artifacts/contracts/VariableUtilisationRatesCalculator.sol/VariableUtilisationRatesCalculator.json';
import ERC20PoolArtifact from '../../../artifacts/contracts/ERC20Pool.sol/ERC20Pool.json';
import CompoundingIndexArtifact from '../../../artifacts/contracts/CompoundingIndex.sol/CompoundingIndex.json';

import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';
import SmartLoanArtifact from '../../../artifacts/contracts/SmartLoan.sol/SmartLoan.json';
import MockSmartLoanArtifact from '../../../artifacts/contracts/mock/MockSmartLoan.sol/MockSmartLoan.json';
import MockTokenArtifact from "../../../artifacts/contracts/mock/MockToken.sol/MockToken.json";
import UpgradeableBeaconArtifact
  from '../../../artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  Asset,
  deployAndInitPangolinExchangeContract,
  formatUnits,
  fromWei,
  getFixedGasSigners,
  getSelloutRepayAmount,
  recompileSmartLoan,
  toBytes32,
  toWei,
} from "../../_helpers";
import {syncTime} from "../../_syncTime"
import {WrapperBuilder} from "redstone-evm-connector";
import {
  CompoundingIndex,
  MockSmartLoan,
  MockSmartLoan__factory,
  MockSmartLoanRedstoneProvider,
  OpenBorrowersRegistry__factory,
  PangolinExchange,
  Pool,
  SmartLoan,
  SmartLoansFactory,
  UpgradeableBeacon,
  VariableUtilisationRatesCalculator
} from "../../../typechain";
import {BigNumber, Contract} from "ethers";
import {parseUnits} from "ethers/lib/utils";
import {ERC20Pool, MockToken} from "../../../typechain";

chai.use(solidity);

const {deployContract, provider} = waffle;
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const linkTokenAddress = '0x5947bb275c521040051d82396192181b413227a3';
const wavaxTokenAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const usdTokenAddress = '0xc7198437980c041c805a1edcba50c1ce5db95118';

const SMART_LOAN_MOCK = "MockSmartLoanRedstoneProvider";
const erc20ABI = [
  'function decimals() public view returns (uint8)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function allowance(address owner, address spender) public view returns (uint256)',
  'function transfer(address dst, uint wad) public returns (bool)'
]

const wavaxAbi = [
  'function deposit() public payable',
  ...erc20ABI
]

const TEST_TABLE =  [
    {
      id: 1,
      fund: {
        AVAX: 1,
        USD: 0
      },
      borrow: {
        AVAX: 1,
        USD: 0
      },
      invest: {}
    }
]

describe('Smart loan',  () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe('A liquidated loan', () => {
    let exchange: PangolinExchange,
      loan: SmartLoan,
      wrappedLoan: any,
      owner: SignerWithAddress,
      borrower: SignerWithAddress,
      depositor: SignerWithAddress,
      usdPool: ERC20Pool,
      wavaxPool: ERC20Pool,
      admin: SignerWithAddress,
      liquidator: SignerWithAddress,
      usdTokenContract: Contract,
      linkTokenContract: Contract,
      wavaxTokenContract: Contract,
      linkTokenDecimalPlaces: BigNumber,
      usdTokenDecimalPlaces: BigNumber,
      beacon: UpgradeableBeacon,
      smartLoansFactory: SmartLoansFactory,
      implementation: SmartLoan,
      artifact: any,
      MOCK_PRICES: any,
      AVAX_PRICE: number,
      LINK_PRICE: number,
      USD_PRICE: number;

    before("deploy provider, exchange and pool", async () => {
      [owner, depositor, borrower, admin, liquidator] = await getFixedGasSigners(10000000);

      usdPool = (await deployContract(owner, ERC20PoolArtifact)) as ERC20Pool;
      wavaxPool = (await deployContract(owner, ERC20PoolArtifact)) as ERC20Pool;
      linkTokenContract = new ethers.Contract(linkTokenAddress, erc20ABI, provider);
      usdTokenContract = new ethers.Contract(usdTokenAddress, erc20ABI, provider);

      exchange = await deployAndInitPangolinExchangeContract(owner, pangolinRouterAddress, [
          new Asset(toBytes32('AVAX'), wavaxTokenAddress),
          new Asset(toBytes32('USD'), usdTokenAddress),
          new Asset(toBytes32('LINK'), linkTokenAddress)
        ]);

      const variableUtilisationRatesCalculatorWavax = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      const borrowersRegistryWavax = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndexWavax = (await deployContract(owner, CompoundingIndexArtifact, [wavaxPool.address])) as CompoundingIndex;
      const borrowingIndexWavax = (await deployContract(owner, CompoundingIndexArtifact, [wavaxPool.address])) as CompoundingIndex;

      const variableUtilisationRatesCalculatorUsd = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      const borrowersRegistryUsd = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndexUsd = (await deployContract(owner, CompoundingIndexArtifact, [usdPool.address])) as CompoundingIndex;
      const borrowingIndexUsd = (await deployContract(owner, CompoundingIndexArtifact, [usdPool.address])) as CompoundingIndex;

      wavaxTokenContract = new ethers.Contract(wavaxTokenAddress, wavaxAbi, provider);

      linkTokenDecimalPlaces = await linkTokenContract.decimals();
      usdTokenDecimalPlaces = await usdTokenContract.decimals();

      AVAX_PRICE = (await redstone.getPrice('AVAX')).value;
      USD_PRICE = (await redstone.getPrice('USDT')).value;
      LINK_PRICE = (await redstone.getPrice('LINK')).value;

      MOCK_PRICES = [
        {
          symbol: 'USD',
          value: USD_PRICE
        },
        {
          symbol: 'LINK',
          value: LINK_PRICE
        },
        {
          symbol: 'AVAX',
          value: AVAX_PRICE
        }
      ];

      await wavaxPool.initialize(
          variableUtilisationRatesCalculatorWavax.address,
          borrowersRegistryWavax.address,
          depositIndexWavax.address,
          borrowingIndexWavax.address,
          wavaxTokenContract.address
      );

      await wavaxTokenContract.connect(depositor).deposit({value: toWei("10000")});
      await wavaxTokenContract.connect(depositor).approve(wavaxPool.address, toWei("10000"));
      await wavaxPool.connect(depositor).deposit(toWei("10000"));


      await usdPool.initialize(
        variableUtilisationRatesCalculatorUsd.address,
        borrowersRegistryUsd.address,
        depositIndexUsd.address,
        borrowingIndexUsd.address,
        usdTokenAddress
      );

      // top-up borrower's wallet with some USDT for further actions
      const initialUsdBorrower = 10000;
      let requiredAvax = toWei((initialUsdBorrower * USD_PRICE * 1.03 / AVAX_PRICE).toString());
      await wavaxTokenContract.connect(borrower).deposit({value: requiredAvax});
      await wavaxTokenContract.connect(borrower).transfer(exchange.address, requiredAvax);
      await exchange.connect(borrower).swap(toBytes32("AVAX"), toBytes32("USD"), requiredAvax, toWei(initialUsdBorrower.toString(), usdTokenDecimalPlaces));

      // top-up depositor's wallet with some USDT and deposit
      const initialUsdDeposit = 2000;
      const initialUsdDepositorWei = toWei(initialUsdDeposit.toString(), usdTokenDecimalPlaces)
      requiredAvax = toWei((initialUsdDeposit * USD_PRICE * 1.03 / AVAX_PRICE).toString());

      await wavaxTokenContract.connect(depositor).deposit({value: requiredAvax});
      await wavaxTokenContract.connect(depositor).transfer(exchange.address, requiredAvax);
      await exchange.connect(depositor).swap(toBytes32("AVAX"), toBytes32("USD"), requiredAvax, initialUsdDepositorWei);

      await usdTokenContract.connect(depositor).approve(usdPool.address, initialUsdDepositorWei);
      await usdPool.connect(depositor).deposit(initialUsdDepositorWei);
      const initialAvaxDepositWei = toWei("100");
      await wavaxTokenContract.connect(depositor).deposit({value: initialAvaxDepositWei});
      await wavaxTokenContract.connect(depositor).approve(wavaxPool.address, initialAvaxDepositWei);
      await wavaxPool.connect(depositor).deposit(initialAvaxDepositWei);
    });

    it("should deploy a smart loan behind a proxy", async () => {
      smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;

      artifact = await recompileSmartLoan(SMART_LOAN_MOCK, [0, 1], {'USD': usdPool.address, 'AVAX': wavaxPool.address},  exchange.address, 'mock');
      implementation = await deployContract(owner, artifact) as SmartLoan;

      await smartLoansFactory.initialize(implementation.address);

      const beaconAddress = await smartLoansFactory.upgradeableBeacon.call(0);
      beacon = (await new ethers.Contract(beaconAddress, UpgradeableBeaconArtifact.abi) as UpgradeableBeacon).connect(owner);

      await smartLoansFactory.connect(borrower).createLoan();

      const loanAddress = await smartLoansFactory.getLoanForOwner(borrower.address);
      loan = ((await new ethers.Contract(loanAddress, MockSmartLoanArtifact.abi)) as MockSmartLoanRedstoneProvider).connect(borrower);

      wrappedLoan = WrapperBuilder
        .mockLite(loan)
        .using(
          () => {
            return {
              prices: MOCK_PRICES,
              timestamp: Date.now()
            }
          })
    });

    it("should fund a loan", async () => {
      await usdTokenContract.connect(borrower).approve(wrappedLoan.address, toWei("400", usdTokenDecimalPlaces));
      await wrappedLoan.fund(toBytes32("USD"), toWei("400", usdTokenDecimalPlaces));
    });

    it("should borrow funds", async () => {
      await wrappedLoan.borrow(toBytes32("USD"), toWei("1000", usdTokenDecimalPlaces));
      await wrappedLoan.borrow(toBytes32("AVAX"), toWei("1"));

      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(1400 + AVAX_PRICE * 1, 1);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.closeTo(1000 + AVAX_PRICE * 1, 1);
      expect(await wrappedLoan.getLTV()).to.be.closeTo(((1000 + AVAX_PRICE) * 1000 / 400).toFixed(0), 1)
    });

    it("should swap", async () => {
      let slippageTolerance = 0.03;
      let swappedUsd = 1300;
      let linkAmount = swappedUsd * USD_PRICE * (1 - slippageTolerance) / LINK_PRICE;

      await wrappedLoan.swap(
        toBytes32('USD'),
        toBytes32('LINK'),
        parseUnits(swappedUsd.toString(), usdTokenDecimalPlaces),
        toWei(linkAmount.toString())
      );


      let balances = await wrappedLoan.getAllAssetsBalances();

      const currentWavaxTokenBalance = fromWei(balances[0]);
      const currentUSDTokenBalance = formatUnits(balances[1], usdTokenDecimalPlaces);
      const currentLINKTokenBalance = fromWei(balances[2]);
      //
      expect(currentWavaxTokenBalance).to.be.equal(1);
      expect(currentUSDTokenBalance).to.be.closeTo(1400 - swappedUsd, 1);
      expect(currentLINKTokenBalance).to.be.closeTo(linkAmount, 4);
    });

    it("should fail a sellout attempt", async () => {
      expect(await wrappedLoan.getLTV()).to.be.lt(5000);
      expect(await wrappedLoan.isSolvent()).to.be.true;
      await expect(wrappedLoan.liquidateLoan(toWei("1", 18), [0, 1])).to.be.revertedWith("Cannot sellout a solvent account");
    });

    it("should sellout assets partially bringing the loan to a solvent state", async () => {
      let balances = await wrappedLoan.getAllAssetsBalances();
      const initWavaxTokenBalance = balances[0];
      const initialUSDTokenBalance = balances[1];
      const initialLINKTokenBalance = balances[2];

      //connecting liquidator to the loan
      loan = ((await new ethers.Contract(await smartLoansFactory.getLoanForOwner(borrower.address), MockSmartLoanArtifact.abi)) as MockSmartLoanRedstoneProvider).connect(liquidator);

      wrappedLoan = WrapperBuilder
        .mockLite(loan)
        .using(
          () => {
            return {
              prices: MOCK_PRICES,
              timestamp: Date.now()
            }
          })

      const initWavaxPoolBalance = await wavaxTokenContract.connect(borrower).balanceOf(wavaxPool.address);

      artifact = await recompileSmartLoan("MockUpgradedSolvencySmartLoan",[0, 1], {'USD': usdPool.address, 'AVAX': wavaxPool.address}, exchange.address, 'mock');
      let newImplementation = await deployContract(owner, artifact) as SmartLoan;

      await beacon.connect(owner).upgradeTo(newImplementation.address);

      expect(await wrappedLoan.isSolvent()).to.be.false;

      const repayAmount = await getSelloutRepayAmount(
        await wrappedLoan.getTotalValue(),
        await wrappedLoan.getDebt(),
        await wrappedLoan.getLiquidationBonus(),
        await wrappedLoan.getMaxLtv()
      )

      let previousLiquidatorBalance = await wavaxTokenContract.balanceOf(liquidator.address);

      await wrappedLoan.liquidateLoan(repayAmount.toLocaleString('fullwide', {useGrouping: false}), [0, 1]);

      expect((fromWei(await wavaxTokenContract.balanceOf(liquidator.address)) - fromWei(previousLiquidatorBalance)) * AVAX_PRICE).to.be.closeTo(
          (((await wrappedLoan.getLiquidationBonus()).toNumber()) * repayAmount / 10**18 / (await wrappedLoan.getPercentagePrecision()).toNumber()), 1);

      expect(await wrappedLoan.isSolvent()).to.be.true;
      expect((await wavaxTokenContract.connect(borrower).balanceOf(wavaxPool.address)).gt(initWavaxPoolBalance)).to.be.true;

      balances = await wrappedLoan.getAllAssetsBalances();

      const currentWavaxTokenBalance = balances[0];
      const currentUSDTokenBalance = balances[1];
      const currentLINKTokenBalance = balances[2];

      expect(currentWavaxTokenBalance).to.be.lt(initWavaxTokenBalance);
      expect(currentUSDTokenBalance).to.be.lt(initialUSDTokenBalance);
      if (currentUSDTokenBalance == 0) {
        expect(currentLINKTokenBalance).to.be.lt(initialLINKTokenBalance);
      } else {
        expect(currentLINKTokenBalance).to.be.eq(initialLINKTokenBalance);
      }
    });
  });
});

