import {awaitConfirmation, erc20ABI, isOracleError, isPausedError, wrapContract} from '../utils/blockchain';
import SMART_LOAN from '@artifacts/contracts/interfaces/SmartLoanGigaChadInterface.sol/SmartLoanGigaChadInterface.json';
import SMART_LOAN_FACTORY_TUP from '@contracts/SmartLoansFactoryTUP.json';
import SMART_LOAN_FACTORY from '@contracts/SmartLoansFactory.json';
import TOKEN_MANANGER from '@contracts/TokenManager.json';
import {formatUnits, fromWei, parseUnits, toWei} from '@/utils/calculate';
import config from '@/config';
import redstone from 'redstone-api';
import {BigNumber, Contract} from 'ethers';
import TOKEN_ADDRESSES from '../../common/addresses/avax/token_addresses.json';
import {mergeArrays, removePaddedTrailingZeros} from '../utils/calculate';
import INTERMEDIARY from '@artifacts/contracts/integrations/UniswapV2Intermediary.sol/UniswapV2Intermediary.json';

const toBytes32 = require('ethers').utils.formatBytes32String;
const fromBytes32 = require('ethers').utils.parseBytes32String;

const ethers = require('ethers');

const wavaxTokenAddress = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const usdcTokenAddress = '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e';

const tokenAddresses = TOKEN_ADDRESSES;

const wavaxAbi = [
  'function deposit() public payable',
  ...erc20ABI
];

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

export default {
  namespaced: true,
  state: {
    assets: null,
    lpAssets: null,
    supportedAssets: null,
    provider: null,
    smartLoanContract: null,
    smartLoanFactoryContract: null,
    wavaxTokenContract: null,
    usdcTokenContract: null,
    assetBalances: null,
    lpBalances: null,
    debt: null,
    totalValue: null,
    thresholdWeightedValue: null,
    health: null,
    fullLoanStatus: {},
    noSmartLoan: null,
    protocolPaused: false,
    oracleError: false,
    debtsPerAsset: null,
  },
  mutations: {
    setSmartLoanContract(state, smartLoanContract) {
      state.smartLoanContract = smartLoanContract;
    },

    setAssets(state, assets) {
      state.assets = assets;
    },

    setLpAssets(state, assets) {
      state.lpAssets = assets;
    },

    setSupportedAssets(state, assets) {
      state.supportedAssets = assets;
    },

    setSmartLoanFactoryContract(state, smartLoanFactoryContract) {
      state.smartLoanFactoryContract = smartLoanFactoryContract;
    },

    setWavaxTokenContract(state, wavaxTokenContract) {
      state.wavaxTokenContract = wavaxTokenContract;
    },

    setUsdcTokenContract(state, usdcTokenContract) {
      state.usdcTokenContract = usdcTokenContract;
    },

    setAssetBalances(state, assetBalances) {
      state.assetBalances = assetBalances;
    },

    setLpBalances(state, lpBalances) {
      state.lpBalances = lpBalances;
    },

    setFullLoanStatus(state, status) {
      state.fullLoanStatus = status;
    },

    setNoSmartLoan(state, noSmartLoan) {
      state.noSmartLoan = noSmartLoan;
    },

    setProtocolPaused(state, paused) {
      state.protocolPaused = paused;
    },

    setOracleError(state, error) {
      state.oracleError = error;
    },

    setDebtsPerAsset(state, debtsPerAsset) {
      state.debtsPerAsset = debtsPerAsset;
    },
  },

  getters: {
    getHealth(state) {
      if (state.fullLoanStatus) {
        return state.fullLoanStatus.thresholdWeightedValue ? Math.max(1 - state.fullLoanStatus.debt / state.fullLoanStatus.thresholdWeightedValue) : 0;
      }
    }
  },

  actions: {
    async fundsStoreSetup({state, dispatch, commit}) {
      await dispatch('setupContracts');
      await dispatch('setupSmartLoanContract');
      await dispatch('setupSupportedAssets');
      await dispatch('setupAssets');
      await dispatch('setupLpAssets');
      state.assetBalances = [];
      if (state.smartLoanContract.address !== NULL_ADDRESS) {
        state.assetBalances = null;
        try {
          await state.smartLoanContract.getMaxLiquidationBonus();
          await commit('setProtocolPaused', false);
        } catch (e) {
          if (isPausedError(e)) await commit('setProtocolPaused', true);
        }
        await dispatch('getAllAssetsBalances');
        await dispatch('getDebtsPerAsset');
        try {
          await dispatch('getFullLoanStatus');
        } catch (e) {
          if (isOracleError(e)) await commit('setOracleError', true);
        }

        commit('setNoSmartLoan', false);
      } else {
        commit('setNoSmartLoan', true);
      }
    },

    async updateFunds({state, dispatch, commit}) {
      if (state.smartLoanContract.address !== NULL_ADDRESS) {
        commit('setNoSmartLoan', false);
      }
      await dispatch('setupAssets');
      await dispatch('setupLpAssets');
      await dispatch('getAllAssetsBalances');
      await dispatch('getDebtsPerAsset');
      await dispatch('getFullLoanStatus');
      setTimeout(async () => {
        await dispatch('getFullLoanStatus');
      }, 5000);
    },


    async setupSupportedAssets({commit}) {
      const tokenManager = new ethers.Contract(TOKEN_MANANGER.address, TOKEN_MANANGER.abi, provider.getSigner());
      const whiteListedTokenAddresses = await tokenManager.getSupportedTokensAddresses();

      const supported = whiteListedTokenAddresses.map(address => Object.keys(tokenAddresses).find(symbol => tokenAddresses[symbol].toLowerCase() === address.toLowerCase()));

      commit('setSupportedAssets', supported);
    },

    async setupAssets({state, commit}) {
      const nativeToken = Object.entries(config.ASSETS_CONFIG).find(asset => asset[0] === config.nativeToken);

      let assets = {};
      assets[nativeToken[0]] = nativeToken[1];

      Object.values(config.ASSETS_CONFIG).forEach(
        asset => {
          if (state.supportedAssets.includes(asset.symbol)) {
            assets[asset.symbol] = asset;
          }
        }
      );

      await redstone.getPrice(Object.keys(assets)).then(prices => {
        Object.keys(assets).forEach(assetSymbol => {
          assets[assetSymbol].price = prices[assetSymbol].value;
        });
      });
      commit('setAssets', assets);
    },

    async setupLpAssets({state, commit}) {
      let lpTokens = {};

      Object.values(config.LP_ASSETS_CONFIG).forEach(
        asset => {
          if (state.supportedAssets.includes(asset.symbol)) {
            lpTokens[asset.symbol] = asset;
          }
        }
      );

      await redstone.getPrice(Object.keys(lpTokens)).then(prices => {
        Object.keys(lpTokens).forEach(assetSymbol => {
          lpTokens[assetSymbol].price = prices[assetSymbol].value;
        });
      });
      commit('setLpAssets', lpTokens);
    },

    async setupContracts({rootState, commit}) {
      const provider = rootState.network.provider;

      const smartLoanFactoryContract = new ethers.Contract(SMART_LOAN_FACTORY_TUP.address, SMART_LOAN_FACTORY.abi, provider.getSigner());
      const wavaxTokenContract = new ethers.Contract(wavaxTokenAddress, wavaxAbi, provider.getSigner());
      const usdcTokenContract = new ethers.Contract(usdcTokenAddress, erc20ABI, provider.getSigner());

      commit('setSmartLoanFactoryContract', smartLoanFactoryContract);
      commit('setWavaxTokenContract', wavaxTokenContract);
      commit('setUsdcTokenContract', usdcTokenContract);
    },

    async setupSmartLoanContract({state, rootState, commit}) {
      const provider = rootState.network.provider;
      const smartLoanAddress = await state.smartLoanFactoryContract.getLoanForOwner(rootState.network.account);

      const smartLoanContract = new ethers.Contract(smartLoanAddress, SMART_LOAN.abi, provider.getSigner());

      commit('setSmartLoanContract', smartLoanContract);
    },

    async createLoan({state, rootState}) {
      const provider = rootState.network.provider;

      const transaction = (await wrapContract(state.smartLoanFactoryContract)).createLoan({gasLimit: 8000000});

      await awaitConfirmation(transaction, provider, 'createLoan');
    },

    async createAndFundLoan({state, rootState, commit, dispatch}, {asset, value}) {
      const provider = rootState.network.provider;
      //TODO: make it more robust
      if (asset === 'AVAX') {
        asset = config.ASSETS_CONFIG['AVAX'];
        await state.wavaxTokenContract.deposit({value: toWei(String(value))});
      }

      if (asset === 'WAVAX') {
        asset = config.ASSETS_CONFIG['AVAX'];
      }

      const amount = parseUnits(String(value), config.ASSETS_CONFIG[asset.symbol].decimals);
      const fundTokenContract = new ethers.Contract(tokenAddresses[asset.symbol], erc20ABI, provider.getSigner());

      await fundTokenContract.approve(state.smartLoanFactoryContract.address, amount);

      const wrappedSmartLoanFactoryContract = await wrapContract(state.smartLoanFactoryContract);

      const transaction = await wrappedSmartLoanFactoryContract.createAndFundLoan(toBytes32(asset.symbol), fundTokenContract.address, amount, {gasLimit: 8000000});

      await awaitConfirmation(transaction, provider, 'createAndFundLoan');
      await dispatch('setupSmartLoanContract');
      // TODO check on mainnet
      setTimeout(async () => {
        await dispatch('updateFunds');
        await dispatch('network/updateBalance', {}, {root: true});
      }, 5000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async getAllAssetsBalances({state, commit}) {
      const balances = {};
      const lpBalances = {};
      const assetBalances = await state.smartLoanContract.getAllAssetsBalances();
      assetBalances.forEach(
        asset => {
          let symbol = fromBytes32(asset.name);
          if (config.ASSETS_CONFIG[symbol]) {
            balances[symbol] = formatUnits(asset.balance.toString(), config.ASSETS_CONFIG[symbol].decimals);
          }
          if (config.LP_ASSETS_CONFIG[symbol]) {
            lpBalances[symbol] = formatUnits(asset.balance.toString(), config.LP_ASSETS_CONFIG[symbol].decimals);
          }
        }
      );

      await commit('setAssetBalances', balances);
      await commit('setLpBalances', lpBalances);
    },

    async getDebtsPerAsset({state, commit}) {
      const debtsPerAsset = {};
      const debts = await state.smartLoanContract.getDebts();
      debts.forEach(debt => {
        const asset = fromBytes32(debt.name);
        const debtValue = formatUnits(debt.debt, config.ASSETS_CONFIG[asset].decimals);
        debtsPerAsset[asset] = {asset: asset, debt: debtValue};
      });
      commit('setDebtsPerAsset', debtsPerAsset);
    },

    async getFullLoanStatus({state, commit}) {
      const loanAssets = mergeArrays([
        (await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG)
      ]);

      const fullLoanStatusResponse = await (await wrapContract(state.smartLoanContract, loanAssets)).getFullLoanStatus();
      const fullLoanStatus = {
        totalValue: fromWei(fullLoanStatusResponse[0]),
        debt: fromWei(fullLoanStatusResponse[1]),
        thresholdWeightedValue: fromWei(fullLoanStatusResponse[2]),
        health: fromWei(fullLoanStatusResponse[3]),
      };
      commit('setFullLoanStatus', fullLoanStatus);
    },

    async swapToWavax({state, rootState}) {
      const provider = rootState.network.provider;
      await state.wavaxTokenContract.connect(provider.getSigner()).deposit({value: toWei('1000')});
    },

    async fund({state, rootState, commit, dispatch}, {fundRequest}) {
      const provider = rootState.network.provider;

      const fundToken = new ethers.Contract(tokenAddresses[fundRequest.asset], erc20ABI, provider.getSigner());

      await fundToken.connect(provider.getSigner()).approve(state.smartLoanContract.address, parseUnits(fundRequest.value, fundRequest.assetDecimals));

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [fundRequest.asset]
      ]);

      const transaction = await (await wrapContract(state.smartLoanContract, loanAssets)).fund(toBytes32(fundRequest.asset), parseUnits(fundRequest.value, fundRequest.assetDecimals), {gasLimit: 8000000});

      await awaitConfirmation(transaction, provider, 'fund');
      await dispatch('getAllAssetsBalances');
      setTimeout(async () => {
        await dispatch('updateFunds');
        await dispatch('network/updateBalance', {}, {root: true});
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async fundNativeToken({state, rootState, commit, dispatch}, {value}) {
      console.log('fund native token');
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [config.nativeToken]
      ]);

      const transaction = (await wrapContract(state.smartLoanContract, loanAssets)).depositNativeToken({
        value: toWei(String(value)),
        gasLimit: 8000000
      });

      console.log('firing transaction');
      await awaitConfirmation(transaction, provider, 'fund');
      console.log('transaction success');
      setTimeout(async () => {
        await dispatch('getAllAssetsBalances');
        await dispatch('updateFunds');
        await dispatch('network/updateBalance', {}, {root: true});
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async withdraw({state, rootState, commit, dispatch}, {withdrawRequest}) {
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG)
      ]);

      const transaction = (await wrapContract(state.smartLoanContract, loanAssets)).withdraw(toBytes32(withdrawRequest.asset),
        parseUnits(String(withdrawRequest.value), withdrawRequest.assetDecimals), {gasLimit: 8000000});
      await awaitConfirmation(transaction, provider, 'withdraw');
      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async withdrawNativeToken({state, rootState, commit, dispatch}, {withdrawRequest}) {
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG)
      ]);

      const transaction = await (await wrapContract(state.smartLoanContract, loanAssets)).unwrapAndWithdraw(toWei(String(withdrawRequest.value)));

      await awaitConfirmation(transaction, provider, 'withdraw');
      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 1000);
    },

    async provideLiquidity({state, rootState, commit, dispatch}, {provideLiquidityRequest}) {
      console.log(provideLiquidityRequest);
      const provider = rootState.network.provider;

      const firstDecimals = config.ASSETS_CONFIG[provideLiquidityRequest.firstAsset].decimals;
      const secondDecimals = config.ASSETS_CONFIG[provideLiquidityRequest.secondAsset].decimals;

      let minAmount = 0.9;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [provideLiquidityRequest.symbol]
      ]);

      const wrappedContract = await wrapContract(state.smartLoanContract, loanAssets);

      const transaction = await wrappedContract[config.DEX_CONFIG[provideLiquidityRequest.dex].addLiquidityMethod](
        toBytes32(provideLiquidityRequest.firstAsset),
        toBytes32(provideLiquidityRequest.secondAsset),
        parseUnits(provideLiquidityRequest.firstAmount, BigNumber.from(firstDecimals.toString())),
        parseUnits(provideLiquidityRequest.secondAmount, BigNumber.from(secondDecimals.toString())),
        parseUnits((minAmount * Number(provideLiquidityRequest.firstAmount)).toFixed(firstDecimals), BigNumber.from(firstDecimals.toString())),
        parseUnits((minAmount * Number(provideLiquidityRequest.secondAmount)).toFixed(secondDecimals), BigNumber.from(secondDecimals.toString())),
        {gasLimit: 8000000}
      );

      console.log(transaction);

      await awaitConfirmation(transaction, provider, 'provide liquidity');

      await dispatch('getAllAssetsBalances');
      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async removeLiquidity({state, rootState, commit, dispatch}, {removeLiquidityRequest}) {

      const provider = rootState.network.provider;

      const firstDecimals = config.ASSETS_CONFIG[removeLiquidityRequest.firstAsset].decimals;
      const secondDecimals = config.ASSETS_CONFIG[removeLiquidityRequest.secondAsset].decimals;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [removeLiquidityRequest.firstAsset, removeLiquidityRequest.secondAsset]
      ]);

      const wrappedContract = await wrapContract(state.smartLoanContract, loanAssets);

      const transaction = await wrappedContract[config.DEX_CONFIG[removeLiquidityRequest.dex].removeLiquidityMethod](
        toBytes32(removeLiquidityRequest.firstAsset),
        toBytes32(removeLiquidityRequest.secondAsset),
        parseUnits(removePaddedTrailingZeros(removeLiquidityRequest.value), BigNumber.from(removeLiquidityRequest.assetDecimals.toString())),
        parseUnits((removeLiquidityRequest.minFirstAmount), BigNumber.from(firstDecimals.toString())),
        parseUnits((removeLiquidityRequest.minSecondAmount), BigNumber.from(secondDecimals.toString())),
        {gasLimit: 8000000}
      );


      await awaitConfirmation(transaction, provider, 'remove liquidity');

      await dispatch('getAllAssetsBalances');
      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async borrow({state, rootState, commit, dispatch}, {borrowRequest}) {
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [borrowRequest.asset]
      ]);

      const transaction = await (await wrapContract(state.smartLoanContract, loanAssets)).borrow(toBytes32(borrowRequest.asset),
        parseUnits(String(borrowRequest.amount), config.ASSETS_CONFIG[borrowRequest.asset].decimals), {gasLimit: 8000000});

      await awaitConfirmation(transaction, provider, 'borrow');
      setTimeout(async () => {
        await dispatch('updateFunds');
        await dispatch('poolStore/setupPools', {}, {root: true});
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async repay({state, rootState, commit, dispatch}, {repayRequest}) {
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG)
      ]);

      const transaction = await (await wrapContract(state.smartLoanContract, loanAssets)).repay(toBytes32(repayRequest.asset), toWei(String(repayRequest.amount)), {gasLimit: 8000000});

      await awaitConfirmation(transaction, provider, 'repay');
      setTimeout(async () => {
        await dispatch('updateFunds');
        await dispatch('poolStore/setupPools', {}, {root: true});
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },

    async swap({state, rootState, commit, dispatch}, {swapRequest}) {
      const provider = rootState.network.provider;

      const loanAssets = mergeArrays([(
        await state.smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG),
        [swapRequest.targetAsset]
      ]);

      let amount = parseUnits(String(swapRequest.sourceAmount), config.ASSETS_CONFIG[swapRequest.sourceAsset].decimals);
      //  TODO: optimize and use YakSwap
      let estimatedReceivedTokens = toWei("0");
      let chosenDex;

      for (let dex in config.DEX_CONFIG) {
        const intermediaryContract = new Contract(config.DEX_CONFIG[dex].intermediaryAddress, INTERMEDIARY.abi, provider.getSigner());

        const whitelistedTokens = await intermediaryContract.getAllWhitelistedTokens();
        const whiteListedTokensUppercase = whitelistedTokens.map(address => address.toUpperCase());
        const isSourceAssetWhiteListed = whiteListedTokensUppercase.includes(tokenAddresses[swapRequest.sourceAsset].toUpperCase());
        const isTargetAssetWhiteListed = whiteListedTokensUppercase.includes(tokenAddresses[swapRequest.targetAsset].toUpperCase());console.log(isTargetAssetWhiteListed);
        const areWhitelisted = isSourceAssetWhiteListed && isTargetAssetWhiteListed;

        if (areWhitelisted) {
          let receivedAmount = await intermediaryContract.getMaximumTokensReceived(amount, tokenAddresses[swapRequest.sourceAsset], tokenAddresses[swapRequest.targetAsset]);

          if (receivedAmount.gt(estimatedReceivedTokens)) {
            estimatedReceivedTokens = receivedAmount;
            chosenDex = dex;
          }
        }
      }

      const transaction = await (await wrapContract(state.smartLoanContract, loanAssets))[config.DEX_CONFIG[chosenDex].swapMethod](
        toBytes32(swapRequest.sourceAsset),
        toBytes32(swapRequest.targetAsset),
        amount,
        parseUnits(String(0), config.ASSETS_CONFIG[swapRequest.targetAsset].decimals),
        {gasLimit: 8000000}
      );

      await awaitConfirmation(transaction, provider, 'swap');
      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 1000);

      setTimeout(async () => {
        await dispatch('updateFunds');
      }, 30000);
    },
  }
};
