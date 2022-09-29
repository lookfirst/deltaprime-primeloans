import POOLTUP from '@contracts/WavaxPoolTUP.json';
import POOL from '@artifacts/contracts/WrappedNativeTokenPool.sol/WrappedNativeTokenPool.json'
import {
  awaitConfirmation
} from "../utils/blockchain";
import {parseLogs} from "../utils/calculate";
import {fetchDepositFromPayments, fetchEventsForPool} from "../utils/graph";

const ethers = require('ethers');

export default {
  namespaced: true,
  state: {
    pool: null,
    totalSupply: null,
    totalBorrowed: null,
    depositRate: null,
    borrowingRate: null,
    poolEvents: null,
    depositInterest: null,
    userBorrowed: null,
    userDepositBalance: null
  },
  mutations: {
    setPool(state, pool) {
      state.pool = pool;
    },
    setTotalSupply(state, totalSupply) {
      state.totalSupply = totalSupply;
    },
    setTotalBorrowed(state, totalBorrowed) {
      state.totalBorrowed = totalBorrowed;
    },
    setDepositRate(state, depositRate) {
      state.depositRate = depositRate;
    },
    setBorrowingRate(state, borrowingRate) {
      state.borrowingRate = borrowingRate;
    },
    setPoolEvents(state, poolEvents) {
      state.poolEvents = poolEvents;
    },
    setDepositInterest(state, depositInterest) {
      state.depositInterest = depositInterest;
    },
    setUserBorrowed(state, userBorrowed) {
      state.userBorrowed = userBorrowed;
    },
    setUserDepositBalance(state, deposited) {
      state.userDepositBalance = deposited;
    }
  },
  getters: {
    getAvailable(state) {
      return (state.totalSupply * 0.95 - state.totalBorrowed);
    }
  },
  actions: {
    async initPool({ state, commit, rootState }) {
      if (!state.pool) {
        const provider = rootState.network.provider;

        let pool = new ethers.Contract(POOLTUP.address, POOL.abi, provider.getSigner());
        pool.iface = new ethers.utils.Interface(POOL.abi);

        commit('setPool', pool);
      }
    },
    async updatePoolData({ dispatch }) {
      Promise.all([
        dispatch('updateTotalSupply'),
        dispatch('updateTotalBorrowed'),
        dispatch('updateDepositRate'),
        dispatch('updateBorrowingRate'),
        dispatch('updateUserDepositBalance'),
        dispatch('updateUserBorrowed'),
        dispatch('updatePoolEvents')
      ])
    },
    async updateTotalSupply({ state, commit }) {
      const totalSupply = parseFloat(ethers.utils.formatEther(await state.pool.totalSupply()));
      commit('setTotalSupply', totalSupply);
    },
    async updateTotalBorrowed({ state, commit }) {
      const totalBorrowed = parseFloat(ethers.utils.formatEther(await state.pool.totalBorrowed()));
      commit('setTotalBorrowed', totalBorrowed);
    },
    async updateUserDepositBalance({ state, commit, rootState }) {
      const userDepositBalance = parseFloat(ethers.utils.formatEther(await state.pool.balanceOf(rootState.network.account)));
      commit('setUserDepositBalance', userDepositBalance);
      return true;
    },
    async updateDepositRate({ state, commit }) {
      const depositRate = parseFloat(ethers.utils.formatEther(await state.pool.getDepositRate()));
      commit('setDepositRate', depositRate);
    },
    async updateBorrowingRate({ state, commit }) {
      const borrowingRate = parseFloat(ethers.utils.formatEther(await state.pool.getBorrowingRate()));
      commit('setBorrowingRate', borrowingRate);
    },
    async updatePoolEvents({ commit, state, rootState }) {
      const pool = state.pool;
      const account = rootState.network.account;
      const poolDepositorBalance = await pool.balanceOf(account);

      pool.myDeposits = parseFloat(ethers.utils.formatEther(poolDepositorBalance));

      const logs = await fetchEventsForPool(account);

      const poolEvents = parseLogs(logs);


      commit('setPoolEvents', poolEvents);

      const depositInterest = pool.myDeposits - await fetchDepositFromPayments(account);

      commit('setDepositInterest', depositInterest);
    },
    async updateUserBorrowed({ state, rootState, commit }) {
      const balance = await state.pool.getBorrowed(rootState.network.account);
      const userBorrowed = parseFloat(ethers.utils.formatEther(balance));

      commit('setUserBorrowed', userBorrowed);
    },
    async sendDeposit({ state, rootState, dispatch, commit }, { amount }) {
      const tx = await state.pool.depositNativeToken({gasLimit: 600000, value: ethers.utils.parseEther(amount.toString())});
      const provider = rootState.network.provider;

      await awaitConfirmation(tx, provider, 'deposit');

      dispatch('updatePoolEvents');
      dispatch('updatePoolData');
      dispatch('network/updateBalance', {}, {root: true})
    },
    async withdraw({ state, dispatch, commit, rootState }, { amount }) {
      const tx = await state.pool.withdraw(ethers.utils.parseEther(amount.toString()), {gasLimit: 500000});
      const provider = rootState.network.provider;

      await awaitConfirmation(tx, provider, 'withdraw');

      dispatch('updatePoolEvents');
      dispatch('updatePoolData');
      dispatch('network/updateBalance', {}, {root: true})
    }
  },
};
