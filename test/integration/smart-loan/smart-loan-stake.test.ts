import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";
import redstone from 'redstone-api';

import VariableUtilisationRatesCalculatorArtifact
  from '../../../artifacts/contracts/VariableUtilisationRatesCalculator.sol/VariableUtilisationRatesCalculator.json';
import WrappedPoolArtifact from '../../../artifacts/contracts/WrappedPool.sol/WrappedPool.json';
import CompoundingIndexArtifact from '../../../artifacts/contracts/CompoundingIndex.sol/CompoundingIndex.json';

import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';
import SmartLoanArtifact from '../../../artifacts/contracts/SmartLoan.sol/SmartLoan.json';
import MockSmartLoanArtifact from '../../../artifacts/contracts/mock/MockSmartLoan.sol/MockSmartLoan.json';
import UpgradeableBeaconArtifact
  from '../../../artifacts/@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol/UpgradeableBeacon.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  Asset, calculateStakingTokensAmountBasedOnAvaxValue,
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
  VariableUtilisationRatesCalculator, WrappedPool,
  YieldYakRouter__factory
} from "../../../typechain";
import {BigNumber, Contract} from "ethers";
import {parseUnits} from "ethers/lib/utils";

chai.use(solidity);

const {deployContract, provider} = waffle;
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';
const usdTokenAddress = '0xc7198437980c041c805a1edcba50c1ce5db95118';
const linkTokenAddress = '0x5947bb275c521040051d82396192181b413227a3';
const wavaxTokenAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const yakStakingTokenAddress = "0xaAc0F2d0630d1D09ab2B5A400412a4840B866d95";

const SMART_LOAN_MOCK = "MockSmartLoanRedstoneProvider";
const erc20ABI = [
  'function decimals() public view returns (uint8)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function allowance(address owner, address spender) public view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function totalDeposits() external view returns (uint256)'
]


describe('Smart loan',  () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe('A loan with staking operations', () => {
    let exchange: PangolinExchange,
      smartLoansFactory: SmartLoansFactory,
      implementation: SmartLoan,
      yakRouterContract: Contract,
      loan: MockSmartLoanRedstoneProvider,
      wrappedLoan: any,
      pool: WrappedPool,
      owner: SignerWithAddress,
      depositor: SignerWithAddress,
      usdTokenContract: Contract,
      usdTokenDecimalPlaces: BigNumber,
      MOCK_PRICES: any,
      AVAX_PRICE: number,
      USD_PRICE: number,
      artifact: any;

    before("deploy factory, exchange and pool", async () => {
      [owner, depositor] = await getFixedGasSigners(10000000);

      const variableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      pool = (await deployContract(owner, WrappedPoolArtifact)) as WrappedPool;
      yakRouterContract = await (new YieldYakRouter__factory(owner).deploy());
      usdTokenContract = new ethers.Contract(usdTokenAddress, erc20ABI, provider);

      exchange = await deployAndInitPangolinExchangeContract(owner, pangolinRouterAddress, [
          new Asset(toBytes32('AVAX'), wavaxTokenAddress),
          new Asset(toBytes32('USD'), usdTokenAddress)
      ]);

      const borrowersRegistry = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;
      const borrowingIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;

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
      ]

      await pool.initialize(
        variableUtilisationRatesCalculator.address,
        borrowersRegistry.address,
        depositIndex.address,
        borrowingIndex.address,
        wavaxTokenAddress
      );

      await pool.connect(depositor).depositInNative({value: toWei("1000")});

      smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;
      artifact = await recompileSmartLoan(SMART_LOAN_MOCK, [0], { "AVAX": pool.address}, exchange.address, yakRouterContract.address,  'mock');
      implementation = await deployContract(owner, artifact) as SmartLoan;

      await smartLoansFactory.initialize(implementation.address);
    });


  describe('A loan with staking operations', () => {
    let exchange: PangolinExchange,
        smartLoansFactory: SmartLoansFactory,
        implementation: SmartLoan,
        yakRouterContract: Contract,
        loan: MockSmartLoanRedstoneProvider,
        wrappedLoan: any,
        pool: Pool,
        owner: SignerWithAddress,
        depositor: SignerWithAddress,
        usdTokenContract: Contract,
        usdTokenDecimalPlaces: BigNumber,
        yakStakingContract: Contract,
        MOCK_PRICES: any,
        AVAX_PRICE: number,
        USD_PRICE: number,
        artifact: any;

    before("deploy factory, exchange and pool", async () => {
      [owner, depositor] = await getFixedGasSigners(10000000);

      const variableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      pool = (await deployContract(owner, PoolArtifact)) as Pool;
      yakRouterContract = await (new YieldYakRouter__factory(owner).deploy());
      usdTokenContract = new ethers.Contract(usdTokenAddress, erc20ABI, provider);

      exchange = await deployAndInitPangolinExchangeContract(owner, pangolinRouterAddress, [
        new Asset(toBytes32('AVAX'), wavaxTokenAddress),
        new Asset(toBytes32('USD'), usdTokenAddress)
      ]);
      yakStakingContract = await new ethers.Contract(yakStakingTokenAddress, erc20ABI, provider);

      const borrowersRegistry = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;
      const borrowingIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;

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
      ]

      await pool.initialize(
          variableUtilisationRatesCalculator.address,
          borrowersRegistry.address,
          depositIndex.address,
          borrowingIndex.address
      );
      await pool.connect(depositor).deposit({value: toWei("1000")});

      smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;
      artifact = await recompileSmartLoan(SMART_LOAN_MOCK, pool.address, exchange.address, yakRouterContract.address,  'mock');
      implementation = await deployContract(owner, artifact) as SmartLoan;

      await smartLoansFactory.initialize(implementation.address);
    });

    it("should deploy a smart loan", async () => {
      await smartLoansFactory.connect(owner).createLoan();

      const loanAddress = await smartLoansFactory.getLoanForOwner(owner.address);
      loan = ((await new ethers.Contract(loanAddress, MockSmartLoanArtifact.abi)) as MockSmartLoanRedstoneProvider).connect(owner);

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
      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(0);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
      expect(await wrappedLoan.getLTV()).to.be.equal(0);

      await wrappedLoan.fund({value: toWei("200")});

      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(200);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(0);
      expect(await wrappedLoan.getLTV()).to.be.equal(0);
    });

    it("should stake", async () => {
      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(200);

      let initialStakedBalance = await yakStakingContract.balanceOf(wrappedLoan.address);
      expect(initialStakedBalance).to.be.equal(0);

      await expect(wrappedLoan.stakeAVAXYak(toWei("9999"))).to.be.revertedWith("Not enough AVAX available");

      const stakedAvaxAmount = 50;
      await wrappedLoan.stakeAVAXYak(
          toWei(stakedAvaxAmount.toString())
      );

      let afterStakingStakedBalance = await yakStakingContract.balanceOf(wrappedLoan.address);
      let expectedAfterStakingStakedBalance = await calculateStakingTokensAmountBasedOnAvaxValue(yakStakingContract, toWei(stakedAvaxAmount.toString()));

      expect(afterStakingStakedBalance).to.be.equal(expectedAfterStakingStakedBalance);
      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(200);

    });

    it("should unstake part of staked AVAX", async() => {
      let initialTotalValue = await wrappedLoan.getTotalValue();
      let initialAvaxBalance = await provider.getBalance(wrappedLoan.address);
      let amountAvaxToReceive = toWei("10");
      let initialStakedTokensBalance = await yakStakingContract.balanceOf(wrappedLoan.address);
      let tokenAmountToUnstake = await calculateStakingTokensAmountBasedOnAvaxValue(yakStakingContract, amountAvaxToReceive);

      let expectedAfterUnstakeTokenBalance = initialStakedTokensBalance.sub(tokenAmountToUnstake);

      await wrappedLoan.unstakeAVAXYak(tokenAmountToUnstake);

      expect(expectedAfterUnstakeTokenBalance).to.be.equal(await yakStakingContract.balanceOf(wrappedLoan.address));
      expect(fromWei(await provider.getBalance(wrappedLoan.address))).to.be.closeTo(fromWei(initialAvaxBalance.add(amountAvaxToReceive)), 0.1);
      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.closeTo(fromWei(initialTotalValue), 0.00001);
    });

    it("should fail to unstake more than was initially staked", async() => {
      await expect(wrappedLoan.unstakeAVAXYak(toWei("999999"))).to.be.revertedWith("Cannot unstake more than was initially staked");
    });
  });

  describe('A loan with staking liquidation', () => {
    let exchange: PangolinExchange,
        loan: MockSmartLoanRedstoneProvider,
        smartLoansFactory: SmartLoansFactory,
        wrappedLoan: any,
        yakRouterContract: Contract,
        wrappedLoanUpdated: any,
        pool: Pool,
        owner: SignerWithAddress,
        depositor: SignerWithAddress,
        usdTokenContract: Contract,
        linkTokenContract: Contract,
        yakStakingContract: Contract,
        usdTokenDecimalPlaces: BigNumber,
        linkTokenDecimalPlaces: BigNumber,
        MOCK_PRICES: any,
        MOCK_PRICES_UPDATED: any,
        AVAX_PRICE: number,
        LINK_PRICE: number,
        USD_PRICE: number,
        artifact: any,
        implementation: any;

    before("deploy provider, exchange and pool", async () => {
      [owner, depositor] = await getFixedGasSigners(10000000);

      const variableUtilisationRatesCalculator = (await deployContract(owner, VariableUtilisationRatesCalculatorArtifact)) as VariableUtilisationRatesCalculator;
      pool = (await deployContract(owner, PoolArtifact)) as Pool;
      yakStakingContract = await new ethers.Contract(yakStakingTokenAddress, erc20ABI, provider);
      yakRouterContract = await (new YieldYakRouter__factory(owner).deploy());
      usdTokenContract = new ethers.Contract(usdTokenAddress, erc20ABI, provider);
      linkTokenContract = new ethers.Contract(linkTokenAddress, erc20ABI, provider);

      exchange = await deployAndInitPangolinExchangeContract(owner, pangolinRouterAddress,
          [
            new Asset(toBytes32('AVAX'), wavaxTokenAddress),
            new Asset(toBytes32('USD'), usdTokenAddress),
            new Asset(toBytes32('LINK'), linkTokenAddress)
          ]);

      const borrowersRegistry = await (new OpenBorrowersRegistry__factory(owner).deploy());
      const depositIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;
      const borrowingIndex = (await deployContract(owner, CompoundingIndexArtifact, [pool.address])) as CompoundingIndex;

      usdTokenDecimalPlaces = await usdTokenContract.decimals();
      linkTokenDecimalPlaces = await linkTokenContract.decimals();

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
      ]

      await pool.initialize(
          variableUtilisationRatesCalculator.address,
          borrowersRegistry.address,
          depositIndex.address,
          borrowingIndex.address
      );
      await pool.connect(depositor).deposit({value: toWei("1000")});

      smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;

      artifact = await recompileSmartLoan(SMART_LOAN_MOCK, pool.address, exchange.address, yakRouterContract.address,  'mock');
      implementation = await deployContract(owner, artifact) as SmartLoan;

      await smartLoansFactory.initialize(implementation.address);
    });

    it("should deploy a smart loan, fund, borrow and invest", async () => {
      await smartLoansFactory.connect(owner).createLoan();

      const loanAddress = await smartLoansFactory.getLoanForOwner(owner.address);
      loan = ((await new ethers.Contract(loanAddress, MockSmartLoanArtifact.abi)) as MockSmartLoanRedstoneProvider).connect(owner);

      wrappedLoan = WrapperBuilder
          .mockLite(loan)
          .using(
              () => {
                return {
                  prices: MOCK_PRICES,
                  timestamp: Date.now()
                }
              })

      await wrappedLoan.fund({value: toWei("100")});
      await wrappedLoan.borrow(toWei("300"));

      expect(fromWei(await wrappedLoan.getTotalValue())).to.be.equal(400);
      expect(fromWei(await wrappedLoan.getDebt())).to.be.equal(300);
      expect(await wrappedLoan.getLTV()).to.be.equal(3000);

      const slippageTolerance = 0.03;

      let investedAmount = Math.floor(64 * AVAX_PRICE);
      let requiredAvaxAmount = USD_PRICE * investedAmount * (1 + slippageTolerance) / AVAX_PRICE;

      await wrappedLoan.invest(
          toBytes32('USD'),
          parseUnits(investedAmount.toString(), usdTokenDecimalPlaces),
          toWei(requiredAvaxAmount.toString())
      );

      await wrappedLoan.stakeAVAXYak(
          toWei("270")
      );
    });

    it("should withdraw collateral and part of borrowed funds, bring prices back to normal and liquidate the loan by supplying additional AVAX", async () => {
      // Define "updated" (USD x 1000) prices and build an updated wrapped loan
      AVAX_PRICE = (await redstone.getPrice('AVAX')).value;
      USD_PRICE = (await redstone.getPrice('USDT')).value;
      LINK_PRICE = (await redstone.getPrice('LINK')).value;
      MOCK_PRICES_UPDATED = [
        {
          symbol: 'USD',
          value: USD_PRICE * 1000
        },
        {
          symbol: 'LINK',
          value: LINK_PRICE
        },
        {
          symbol: 'AVAX',
          value: AVAX_PRICE
        }
      ]

      wrappedLoanUpdated = WrapperBuilder
          .mockLite(loan)
          .using(
              () => {
                return {
                  prices: MOCK_PRICES_UPDATED,
                  timestamp: Date.now()
                }
              })

      // Withdraw funds using the updated prices and make sure the "standard" wrappedLoan is Insolvent as a consequence
      expect(await wrappedLoan.isSolvent()).to.be.true;
      await wrappedLoanUpdated.withdraw(toWei("60"));
      expect(await wrappedLoanUpdated.isSolvent()).to.be.true;
      expect(await wrappedLoan.isSolvent()).to.be.false;


      let initialStakedBalance = await yakStakingContract.balanceOf(wrappedLoan.address);

      await wrappedLoan.liquidateLoan(toWei("220"));

      let currentStakedBalance = await yakStakingContract.balanceOf(wrappedLoan.address);

      expect(fromWei(initialStakedBalance)).to.be.greaterThan(fromWei(currentStakedBalance));
      expect(fromWei(currentStakedBalance)).to.be.greaterThan(0);
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });
  });
});

