<template>
  <div id="modal" v-if="lpToken" class="remove-liquidity-modal-component modal-component">
    <Modal>
      <div class="modal__title">
        Remove Liquidity
      </div>

      <CurrencyInput :symbol="lpToken.primary"
                     :symbol-secondary="lpToken.secondary"
                     v-on:newValue="inputChange"
                     :validators="validators"
                     :max="lpTokenBalance">
      </CurrencyInput>

      <div class="transaction-summary-wrapper">
        <TransactionResultSummaryBeta>
          <div class="summary__title">
            Values after transaction:
          </div>
          <div class="summary__values">
            <div class="summary__value__pair">
              <div class="summary__label">
                LP token balance:
              </div>
              <div class="summary__value">
                {{ (lpTokenBalance - amount) > 0 ? lpTokenBalance - amount : 0}}
              </div>
            </div>
            <div class="summary__divider divider--long"></div>
            <div class="summary__value__pair">
              <div class="summary__label">
                {{ firstAsset.symbol }} balance:
              </div>
              <div class="summary__value">
                {{ formatTokenBalance(firstBalance + minReceivedFirst) }}
              </div>
            </div>
            <div class="summary__divider divider--long"></div>
            <div class="summary__value__pair">
              <div class="summary__label">
                {{ secondAsset.symbol }} balance:
              </div>
              <div class="summary__value">
                {{ formatTokenBalance(secondBalance + minReceivedSecond) }}
              </div>
            </div>
          </div>
        </TransactionResultSummaryBeta>
      </div>

      <div class="button-wrapper">
        <Button :label="'Remove liquidity'"
                v-on:click="submit()"
                :waiting="transactionOngoing"
                :disabled="currencyInputError">
        </Button>
      </div>
    </Modal>
  </div>
</template>

<script>
import Modal from './Modal';
import TransactionResultSummaryBeta from './TransactionResultSummaryBeta';
import CurrencyInput from './CurrencyInput';
import Button from './Button';
import Toggle from './Toggle';
import BarGaugeBeta from './BarGaugeBeta';
import config from '../config';
import {erc20ABI} from '../utils/blockchain';
import {toWei} from '../utils/calculate';
import {formatUnits} from 'ethers/lib/utils';

const ethers = require('ethers');

export default {
  name: 'RemoveLiquidityModal',
  components: {
    Button,
    CurrencyInput,
    TransactionResultSummaryBeta,
    Modal,
    BarGaugeBeta,
    Toggle
  },

  props: {
    lpToken: {},
    lpTokenBalance: Number,
    firstBalance: Number,
    secondBalance: Number,
  },

  data() {
    return {
      amount: null,
      validators: [],
      minReceivedFirst: 0,
      minReceivedSecond: 0,
      transactionOngoing: false,
      currencyInputError: false,
    };
  },

  mounted() {
    setTimeout(() => {
      this.setupValidators();
    });
  },

  computed: {
    firstAsset() {
      return config.ASSETS_CONFIG[this.lpToken.primary];
    },
    secondAsset() {
      return config.ASSETS_CONFIG[this.lpToken.secondary];
    },
    minBalanceAfterRemoveFirst() {
      return this.firstBalance + this.minReceivedFirst;
    },
    minBalanceAfterRemoveSecond() {
      return this.secondBalance + this.minReceivedSecond;
    }
  },

  methods: {
    submit() {
      this.transactionOngoing = true;
      this.$emit('REMOVE_LIQUIDITY', {
        asset: this.lpToken.symbol,
        amount: this.amount,
        minReceivedFirst: this.minReceivedFirst,
        minReceivedSecond: this.minReceivedSecond
      });
    },

    async inputChange(event) {
      this.amount = event.value;
      this.currencyInputError = event.error;
      await this.calculateReceivedAmounts(this.amount);
    },

    setupValidators() {
      this.validators = [
        {
          validate: (value) => {
            if (value > this.lpTokenBalance) {
              return 'Exceeds account balance';
            }
          }
        }
      ];
    },

    async calculateReceivedAmounts(lpRemoved) {
      if (this.lpTokenBalance - this.amount <= 0) {
        this.minReceivedFirst = 0;
        this.minReceivedSecond = 0;
      } else {
        //TODO: hardcoded slippage
        const slippage = 0.005; // 0.5% slippage

        const firstToken = new ethers.Contract(this.firstAsset.address, erc20ABI, provider.getSigner());
        const secondToken = new ethers.Contract(this.secondAsset.address, erc20ABI, provider.getSigner());
        const lpToken = new ethers.Contract(this.lpToken.address, erc20ABI, provider.getSigner());

        const firstTokenBalance = await firstToken.balanceOf(this.lpToken.address);
        const secondTokenBalance = await secondToken.balanceOf(this.lpToken.address);
        const totalSupply = await lpToken.totalSupply();

        const firstAmount = toWei(lpRemoved.toString()).mul(firstTokenBalance).div(totalSupply).mul((1 - slippage) * 1000).div(1000);
        const secondAmount = toWei(lpRemoved.toString()).mul(secondTokenBalance).div(totalSupply).mul((1 - slippage) * 1000).div(1000);

        this.minReceivedFirst = Number(formatUnits(firstAmount, this.firstAsset.decimals));
        this.minReceivedSecond = Number(formatUnits(secondAmount, this.secondAsset.decimals));
      }
    }
  }
};
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";
@import "~@/styles/modal";

.remove-liquidity-modal-component {

}


</style>