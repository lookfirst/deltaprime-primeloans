<template>
  <div id="modal" class="borrow-modal-component modal-component">
    <Modal>
      <div class="modal__title">
        Borrow
      </div>

      <div class="modal-top-info">
        <div class="top-info__label">APY:</div>
        <div class="top-info__value">{{ 0.0235 | percent }}</div>
        <div class="top-info__divider"></div>
        <div class="top-info__label">Available in pool:</div>
        <div class="top-info__value">89284423.39 <span class="top-info__currency">AVAX</span></div>
      </div>

      <CurrencyInput :symbol="'AVAX'"></CurrencyInput>

      <div class="transaction-summary-wrapper">
        <TransactionResultSummaryBeta>
          <div class="summary__title">
            Values after transaction:
          </div>
          <div class="summary__values">
            <div class="summary__label">
              LTV:
            </div>
            <div class="summary__value">
              {{ 2.511 | percent }}
            </div>
            <BarGaugeBeta :min="0" :max="5" :value="2.511" :slim="true"></BarGaugeBeta>
            <div class="summary__divider"></div>
            <div class="summary__label">
              Balance:
            </div>
            <div class="summary__value">
              73.12 AVAX
            </div>
          </div>
        </TransactionResultSummaryBeta>
      </div>

      <div class="button-wrapper">
        <Button :label="'Borrow'" v-on:click="submit()"></Button>
      </div>
    </Modal>
  </div>
</template>

<script>
import Modal from './Modal';
import TransactionResultSummaryBeta from './TransactionResultSummaryBeta';
import CurrencyInput from './CurrencyInput';
import Button from './Button';
import BarGaugeBeta from './BarGaugeBeta';

export default {
  name: 'BorrowModal',
  components: {
    Button,
    CurrencyInput,
    TransactionResultSummaryBeta,
    Modal,
    BarGaugeBeta
  },

  methods: {
    submit() {
      this.$emit('borrow', 1);
    }
  }
};
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";
@import "~@/styles/modal";


</style>