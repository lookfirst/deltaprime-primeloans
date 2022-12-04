import {awaitConfirmation, wrapContract} from '../utils/blockchain';
import config from '../config';
import {parseUnits} from 'ethers/lib/utils';
import {BigNumber} from 'ethers';
import {mergeArrays} from "../utils/calculate";
const fromBytes32 = require('ethers').utils.parseBytes32String;


export default {
  namespaced: true,
  state: {
    stakedAssets: null,
  },
  getters: {
    getStakedAssets(state) {
      return state.stakedAssets;
    }
  },
  mutations: {
    setStakedAssets(state, stakedAssets) {
      state.stakedAssets = stakedAssets;
    },
  },
  actions: {

    async stakeStoreSetup({dispatch}) {
      await dispatch('updateStakedBalances');
    },

    //TODO: stakeRequest
    async stake({state, rootState, dispatch, commit}, {stakeRequest}) {

      const provider = rootState.network.provider;
      const smartLoanContract = rootState.fundsStore.smartLoanContract;

      let assets = [
          (await smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
          Object.keys(config.POOLS_CONFIG)
      ];

      if (stakeRequest.symbol) assets.push([stakeRequest.symbol]);

      const loanAssets = mergeArrays(assets);

      const stakeTransaction = await (await wrapContract(smartLoanContract, loanAssets))[stakeRequest.method]
      (
        parseUnits(String(stakeRequest.amount),
          BigNumber.from(stakeRequest.decimals.toString())),
        {gasLimit: 8000000}
      );

      await awaitConfirmation(stakeTransaction, provider, 'stake');

      await dispatch('updateStakedBalances');
      await dispatch('network/updateBalance', {}, {root: true});
    },

    async unstake({state, rootState, dispatch, commit}, {unstakeRequest}) {
      const smartLoanContract = rootState.fundsStore.smartLoanContract;

      const loanAssets = mergeArrays([(
          await smartLoanContract.getAllOwnedAssets()).map(el => fromBytes32(el)),
        Object.keys(config.POOLS_CONFIG)
      ]);

      const unstakeTransaction = unstakeRequest.minAmount ?
         await (await wrapContract(smartLoanContract, loanAssets))[unstakeRequest.method](
             parseUnits(String(unstakeRequest.amount), BigNumber.from(unstakeRequest.decimals.toString())),
             parseUnits(String(unstakeRequest.minAmount), BigNumber.from(unstakeRequest.decimals.toString())),
             {gasLimit: 8000000})
          :
         await (await wrapContract(smartLoanContract, loanAssets))[unstakeRequest.method](parseUnits(String(unstakeRequest.amount), BigNumber.from(unstakeRequest.decimals.toString())), {gasLimit: 8000000});;

      await awaitConfirmation(unstakeTransaction, provider, 'unstake');

      await dispatch('updateStakedBalances');
      await dispatch('network/updateBalance', {}, {root: true});
    },

    async updateStakedBalances({rootState, commit}) {

    },
  }
};
