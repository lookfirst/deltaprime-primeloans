<template>
  <div class="navbar">
    <div class="links-wrapper" :class="{'mobile': isMobile}">
      <router-link to="/pool" style="width: 104px"><span title="Pool">Pool</span></router-link>
      <router-link to="/prime-account" style="width: 193px"><span title="Prime Account">Prime Account</span></router-link>
      <router-link to="/nft/list" style="width: 100px"><span title="NFT">NFT</span></router-link>
    </div>
  </div>
</template>


<script>
  export default {
    name: 'Navbar',
    data() {
      return {
      }
    },
  }
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";

.navbar {
  text-align: center;
  font-size: $font-size-sm;
  position: fixed;
  bottom: 0;
  width: 100%;
  padding-bottom: 1rem;
  z-index: 1;

  @media screen and (min-width: $md) {
    position: initial;
    bottom: initial;
    width: initial;
    padding-bottom: initial;
  }
}

a {
  padding: 8px 30px 8px 30px;
  text-decoration: none !important;
  display: inline-block;
  color: #696969;
}

a:not(.router-link-active):hover {
  font-weight: 500;
}

.router-link-active {
  font-weight: bold;
  border: solid 3px #b9b7ff;
  border-radius: 999px;
  box-shadow: 3px 3px 6px 0 rgba(191, 188, 255, 0.5);
  color: #000000;
}

a :visited{
  color: initial;
}

.links-wrapper.mobile {
  display: flex;
  align-items: center;
  width: min-content;
  background-color: #FCF7F9;
  box-shadow: 7px 7px 30px 0 rgba(191, 188, 255, 50%);
  padding: 0.25rem;
  border-radius: 99999px;
  margin: auto;
}

</style>
<style lang="scss" src="@/styles/app.scss" />
