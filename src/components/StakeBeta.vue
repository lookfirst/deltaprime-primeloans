<template>
  <div class="stake-beta-component">
    <StakingAssetBeta></StakingAssetBeta>
    <StakingAssetBetaDemo></StakingAssetBetaDemo>
  </div>
</template>

<script>
import StakingAssetBeta from './StakingAssetBeta';
import StakingAssetBetaDemo from './StakingAssetBetaDemo';
export default {
  name: 'StakeBeta',
  components: {
    StakingAssetBeta,
    StakingAssetBetaDemo
  }
};
</script>

<style lang="scss" scoped>

.stake-beta-component {
  width: 100%;
}

</style>