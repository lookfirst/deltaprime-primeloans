<template>
  <div id="modal" class="swap-modal-component modal-component">
    <Modal>
      <div class="modal__title">
        Swap
      </div>

      <CurrencyComboInput ref="sourceInput"
                          :asset-options="sourceAssetOptions"
                          v-on:valueChange="sourceInputChange"
                          :validators="sourceValidators">
      </CurrencyComboInput>
      <div class="asset-info">
        Available:
        <span v-if="sourceAssetBalance" class="asset-info__value">{{ sourceAssetBalance }}</span>
        <span v-if="!sourceAssetBalance" class="asset-info__value">0</span>
      </div>

      <div class="reverse-swap-button">
        <img src="src/assets/icons/swap-arrow.svg" class="reverse-swap-icon" v-on:click="reverseSwap">
      </div>

      <CurrencyComboInput ref="targetInput"
                          :asset-options="targetAssetOptions"
                          v-on:valueChange="targetInputChange">
      </CurrencyComboInput>
      <div class="asset-info">
        Price: <span
        class="asset-info__value">1 {{ targetAsset }} = {{ conversionRate | smartRound }} {{ sourceAsset }}</span>
      </div>

      <div class="transaction-summary-wrapper">
        <TransactionResultSummaryBeta>
          <div class="summary__title">
            Values after transaction:
          </div>
          <div class="summary__values">
            <div class="summary__value__pair">
              <div class="summary__label"
                   v-bind:class="{'summary__label--error': healthAfterTransaction > MIN_ALLOWED_HEALTH}">
                Health Ratio:
              </div>
              <div class="summary__value">
                <span class="summary__value--error" v-if="healthAfterTransaction > MIN_ALLOWED_HEALTH">
                  > {{ MIN_ALLOWED_HEALTH | percent }}
                </span>
                <span v-if="healthAfterTransaction <= MIN_ALLOWED_HEALTH">
                  {{ healthAfterTransaction | percent }}
                </span>
                <BarGaugeBeta :min="0" :max="1" :value="healthAfterTransaction" :slim="true" :display-inline="true"></BarGaugeBeta>
              </div>
            </div>
            <div class="summary__divider divider--long"></div>
            <div class="summary__value__pair">
              <div class="summary__label">
                {{ sourceAsset }} balance:
              </div>
              <div class="summary__value">
                {{
                  formatTokenBalance(Number(assetBalances[sourceAsset]) - Number(sourceAssetAmount)) > 0 ? formatTokenBalance(Number(assetBalances[sourceAsset]) - Number(sourceAssetAmount)) : 0
                }}
              </div>
            </div>

            <div class="summary__divider divider--long"></div>
            <div class="summary__value__pair">
              <div class="summary__label">
                {{ targetAsset }} balance:
              </div>
              <div class="summary__value">
                {{ formatTokenBalance(Number(assetBalances[targetAsset]) + Number(targetAssetAmount)) }}
              </div>
            </div>
          </div>
        </TransactionResultSummaryBeta>
      </div>

      <div class="button-wrapper">
        <Button :label="'Swap'"
                v-on:click="submit()"
                :disabled="sourceInputError || targetInputError"
                :waiting="transactionOngoing">
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
import CurrencyComboInput from './CurrencyComboInput';
import BarGaugeBeta from './BarGaugeBeta';
import config from '../config';
import {calculateHealth} from '../utils/calculate';

export default {
  name: 'SwapModal',
  components: {
    CurrencyComboInput,
    Button,
    CurrencyInput,
    TransactionResultSummaryBeta,
    Modal,
    BarGaugeBeta
  },

  props: {},

  data() {
    return {
      sourceAssetOptions: [],
      targetAssetOptions: [],
      sourceAsset: null,
      targetAsset: null,
      sourceAssetBalance: 0,
      targetAssetBalance: null,
      conversionRate: null,
      sourceAssetAmount: null,
      targetAssetAmount: null,
      sourceValidators: [],
      targetValidators: [],
      sourceInputError: false,
      targetInputError: false,
      MIN_ALLOWED_HEALTH: config.MIN_ALLOWED_HEALTH,
      healthAfterTransaction: 0,
      assetBalances: [],
      transactionOngoing: false,
    };
  },

  mounted() {
    this.setupSourceAssetOptions();
    this.setupTargetAssetOptions();
    setTimeout(() => {
      this.setupSourceAsset();
      this.setupTargetAsset();
      this.setupConversionRate();
      this.setupValidators();
    });
  },

  computed: {},

  methods: {
    submit() {
      this.transactionOngoing = true;
      this.$emit('SWAP', {
        sourceAsset: this.sourceAsset,
        targetAsset: this.targetAsset,
        sourceAmount: this.sourceAssetAmount,
        targetAmount: this.targetAssetAmount,
      });
    },

    setupSourceAssetOptions() {
      Object.keys(config.ASSETS_CONFIG).forEach(assetSymbol => {
        const asset = config.ASSETS_CONFIG[assetSymbol];
        const assetOption = {
          symbol: assetSymbol,
          name: asset.name,
          logo: `src/assets/logo/${assetSymbol.toLowerCase()}.${asset.logoExt ? asset.logoExt : 'svg'}`
        };
        this.sourceAssetOptions.push(assetOption);
      });
    },

    setupTargetAssetOptions() {
      this.targetAssetOptions = JSON.parse(JSON.stringify(this.sourceAssetOptions));
      this.targetAssetOptions = this.targetAssetOptions.filter(option => option.symbol !== this.sourceAsset);
    },

    setupSourceAsset() {
      this.$refs.sourceInput.setSelectedAsset(this.sourceAsset, true);
    },

    setupTargetAsset() {
      if (this.targetAsset) {
        this.$refs.targetInput.setSelectedAsset(this.targetAsset, true);
      }
    },

    sourceInputChange(change) {
      if (change.asset === this.targetAsset) {
        this.reverseSwap();
      } else {
        this.sourceAsset = change.asset;
        const targetAssetAmount = change.value / this.conversionRate;
        if (!Number.isNaN(targetAssetAmount)) {
          const value = Math.ceil(targetAssetAmount * 1000000) / 1000000;
          this.sourceAssetAmount = change.value;
          this.targetAssetAmount = value;
          this.$refs.targetInput.setCurrencyInputValue(value);

          this.calculateSourceAssetBalance();
          this.setupConversionRate();
          this.calculateHealthAfterTransaction();
        }
      }
      this.sourceInputError = change.error;
    },

    targetInputChange(change) {
      if (change.asset === this.sourceAsset) {
        this.reverseSwap();
      } else {
        this.targetAsset = change.asset;
        const sourceAssetAmount = change.value * this.conversionRate;
        if (!Number.isNaN(sourceAssetAmount)) {
          const value = Math.ceil(sourceAssetAmount * 1000000) / 1000000;
          this.targetAssetAmount = change.value;
          this.sourceAssetAmount = value;
          this.$refs.sourceInput.setCurrencyInputValue(value);

          this.calculateSourceAssetBalance();
          this.setupConversionRate();
          this.calculateHealthAfterTransaction();
        }
      }
      this.targetInputError = change.error;
    },

    setupConversionRate() {
      const sourceAsset = config.ASSETS_CONFIG[this.sourceAsset];
      const targetAsset = config.ASSETS_CONFIG[this.targetAsset];
      this.conversionRate = targetAsset.price / sourceAsset.price;
    },

    calculateSourceAssetBalance() {
      this.sourceAssetBalance = config.ASSETS_CONFIG[this.sourceAsset].balance;
    },

    reverseSwap() {
      const tempSource = this.sourceAsset;
      this.sourceAsset = this.targetAsset;
      this.targetAsset = tempSource;

      this.setupSourceAsset();
      this.setupTargetAsset();

      this.calculateSourceAssetBalance();
      this.setupConversionRate();

      this.calculateHealthAfterTransaction();
    },

    setupValidators() {
      this.sourceValidators = [
        {
          validate: (value) => {
            if (value > this.assetBalances[this.sourceAsset]) {
              return 'Amount exceeds balance';
            }
          }
        },
      ];
    },

    calculateHealthAfterTransaction() {
      const sourceAssetValue = this.sourceAssetAmount * config.ASSETS_CONFIG[this.sourceAsset].price;
      const targetAssetValue = this.targetAssetAmount * config.ASSETS_CONFIG[this.targetAsset].price;
      const totalValueDiff = targetAssetValue - sourceAssetValue;
      // if (this.withdrawValue) {
      //   this.healthAfterTransaction = calculateHealth(this.loan - this.repayValue,
      //     this.thresholdWeightedValue - this.repayValue * this.asset.price * this.asset.maxLeverage);
      // } else {
      //   this.healthAfterTransaction = this.health;
      // }
    },

  }
};
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";
@import "~@/styles/modal";

.swap-modal-component {

  .modal__title {
    margin-bottom: 53px;
  }

  .asset-info {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    font-size: $font-size-xsm;
    color: $steel-gray;
    padding-right: 8px;

    .asset-info__value {
      font-weight: 600;
      margin-left: 5px;
    }
  }

  .reverse-swap-button {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    .reverse-swap-icon {
      width: 52px;
      height: 52px;
      margin: -6px 0 14px 0;
    }
  }
}

.bar-gauge-tall-wrapper {
  padding-top: 5px;
}

</style>