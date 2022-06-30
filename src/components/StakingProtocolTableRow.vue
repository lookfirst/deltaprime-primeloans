<template>
  <div class="staking-protocol-table-row-component">
    <div class="table__row">
      <div class="table__cell protocol-cell">
        <div class="protocol">
          <img class="protocol__icon" :src="protocolIcon">
          <div class="protocol__details">
            <div class="asset-name">{{ asset }}</div>
            <div class="by-protocol">by {{protocolName}}</div>
          </div>
        </div>
      </div>

      <div class="table__cell">
        <div class="double-value staked-balance">
          <div class="double-value__pieces">{{ staked }}</div>
          <div class="double-value__usd">{{ staked * price | usd }}</div>
        </div>
      </div>

      <div class="table__cell">
        {{ apy | percent }}
      </div>

      <div class="table__cell">
        <div class="double-value">
          <div class="double-value__pieces">{{ daily }}</div>
          <div class="double-value__usd">{{ daily * price | usd }}</div>
        </div>
      </div>

      <div class="table__cell">
        <div class="double-value">
          <div class="double-value__pieces">{{ total }}</div>
          <div class="double-value__usd">{{ total * price | usd }}</div>
        </div>
      </div>

      <div class="table__cell">
        <div class="actions">
          <img class="action" src="src/assets/icons/plus.svg" v-on:click="openStakeModal()">
          <img class="action" src="src/assets/icons/minus.svg" v-on:click="openSwapModal()">
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import StakeModal from './StakeModal';
import BorrowModal from './BorrowModal';
import SwapModal from './SwapModal';



export default {
  name: 'StakingProtocolTableRow',
  props: {
    asset: null,
    protocolName: null,
    protocolIcon: null,
    staked: null,
    apy: null,
    daily: null,
    total: null,
    price: null,
  },
  methods: {
    openStakeModal() {
      console.log('open stake modal');
      const modalInstance = this.openModal(StakeModal);
      modalInstance.$on('stake', (stakeEvent) => {
        console.log(stakeEvent);
      });
    },
    openSwapModal() {
      console.log('open stake modal');
      const modalInstance = this.openModal(SwapModal);
      modalInstance.$on('stake', (stakeEvent) => {
        console.log(stakeEvent);
      });
    }
  }
};
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";

.staking-protocol-table-row-component {

  .table__row {
    display: grid;
    grid-template-columns: 20% repeat(5, 1fr);
    height: 60px;
    border-style: solid;
    border-width: 2px 0 0 0;
    border-image-source: linear-gradient(to right, #dfe0ff 43%, #ffe1c2 62%, #ffd3e0 79%);
    border-image-slice: 1;
    padding: 0 6px;

    .table__cell {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      font-weight: 500;
      font-size: $font-size-xsm;

      &.protocol-cell {
        justify-content: flex-start;
      }

      .protocol {
        display: flex;
        flex-direction: row;
        align-items: center;

        .protocol__icon {
          height: 22px;
          width: 22px;
          border-radius: 50%;
        }

        .protocol__details {
          display: flex;
          flex-direction: column;
          margin-left: 10px;

          .asset__name {
            font-size: $font-size-xsm;
            font-weight: 500;
          }

          .by-protocol {
            font-size: $font-size-xxs;
            font-weight: 500;
            color: $medium-gray;
            margin-top: -2px;
          }
        }
      }

      .double-value {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        text-align: end;

        .double-value__pieces {
          font-weight: 500;
          font-size: $font-size-xsm;
        }

        &.staked-balance {
          .double-value__pieces {
            font-weight: 600;
          }
        }

        .double-value__usd {
          font-size: $font-size-xxs;
          color: $medium-gray;
        }

        &.staked-balance {
          .double-value__pieces {

          }
        }
      }

      .actions {
        display: flex;
        flex-direction: row;
        align-items: center;

        .action {
          width: 26px;
          height: 26px;
          cursor: pointer;

          &:not(:last-child) {
            margin-right: 12px;
          }
        }
      }
    }
  }
}
</style>