<template>
<div class="page-content">
  <Banner v-if="showNetworkBanner">
    You are connected to a wrong network. <a @click="connectToProperChain"><b>Click here</b></a> to switch to the correct one.
  </Banner>
  <Banner v-if="showMetamaskBanner">
    Please download and activate
    <a href="https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn" target="_blank"><b>Metamask plugin</b></a>.
  </Banner>
  <Banner v-if="highGasPrice && !showMetamaskBanner && !showNetworkBanner" :closable="true">
    Gas prices are high at the moment. Be careful with your transactions.
  </Banner>
  <Banner :closable="false">
    Beta incoming! Please repay and empty your Prime Account.
  </Banner>
  <div class="top-bar">
    <router-link to="/">
      <img src="src/assets/icons/deltaprime.svg" class="logo">
    </router-link>
    <Navbar></Navbar>
    <div class="connect" v-if="!account" v-on:click="initNetwork()">Connect to wallet</div>
    <Wallet class="wallet" v-else />
  </div>
  <router-view></router-view>
</div>
</template>



<script>
  import Navbar from "@/components/Navbar.vue";
  import Wallet from "@/components/Wallet.vue";
  import Banner from "@/components/Banner";
  import { mapActions, mapState } from "vuex";
  import config from "@/config";
  const ethereum = window.ethereum;
  import Vue from 'vue';

  export default {
    components: {
      Navbar,
      Wallet,
      Banner
    },
    data: () => {
      return {
        showNetworkBanner: false,
        showMetamaskBanner: false,
        highGasPrice: false,
        gasPriceIntervalId: null
      }
    },
    async created() {
      if (!ethereum) {
        this.showMetamaskBanner = true;
        return;
      }

      if (await this.checkConnectedChain() !== config.chainId) {
        this.showNetworkBanner = true;
        return;
      }

      await this.metamaskChecks();
      await this.initNetwork();
      await this.initNfts();
      await this.initPool();
      await this.fetchLoan();
      await this.updatePoolData();
      this.initGasPrices();
    },
    computed: {
      ...mapState('network', ['account', 'provider'])
    },
    methods: {
      ...mapActions("network", ["initNetwork"]),
      ...mapActions("pool", ["initPool", "updatePoolData"]),
      ...mapActions("loan", ["fetchLoan"]),
      ...mapActions("nft", ["initNfts"]),
      async checkConnectedChain() {
        const chainId = await ethereum.request({ method: 'eth_chainId' });

        ethereum.on('chainChanged', () => {
          window.location.reload();
        });

        return this.toDec(chainId);
      },
      async connectToProperChain() {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: this.toHex(config.chainId) }],
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            let walletParams;
            switch(config.chainId) {
              case 2140:
              walletParams = {
                chainName: 'Forked Avalanche',
                  chainId: this.toHex(config.chainId),
                  rpcUrls: ["https://207.154.255.139/"],
                  nativeCurrency: {
                    name: 'AVAX',
                    symbol: 'AVAX',
                    decimals: 18
                  }
              }
              break;
              case 43114:
              walletParams =  {
                chainName: 'Avalanche Mainnet C-Chain',
                chainId: this.toHex(config.chainId),
                rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
                nativeCurrency: {
                name: 'AVAX',
                    symbol: 'AVAX',
                    decimals: 18
                }
              }
              break;
              case 43113:
                walletParams =  {
                  chainName: 'Avalanche FUJI C-Chain',
                  chainId: this.toHex(config.chainId),
                  rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
                  nativeCurrency: {
                    name: 'AVAX',
                    symbol: 'AVAX',
                    decimals: 18
                  }
                }
            }

            try {
              await ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [walletParams]
              });
            } catch (addError) {
              Vue.$toast.error("Error while adding network");
            }
          } else {
            Vue.$toast.error("Error while switching network");
          }
        }
      },
      async metamaskChecks() {
        window.ethereum.on('accountsChanged', function () {
          window.location.reload();
        })
      },
      initGasPrices() {
        this.gasPriceIntervalId = setInterval(async () => {
          this.checkGasPrices();
        }, 2000);
      },
      async checkGasPrices() {
        const resp = await fetch('https://gavax.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle');
        const blockchainData = await resp.json();

        this.highGasPrice = parseInt(blockchainData.result.SafeGasPrice) > 150;
      }
    },
    destroyed() {
      clearInterval(this.gasPriceIntervalId);
    }
  }
</script>

<style lang="scss" scoped>
@import "~@/styles/variables";

  a {
    color: black;
  }

  .page-content:before {
    content: ' ';
    display: block;
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    opacity: 0.08;
    z-index: -1;

    background-image: linear-gradient(152deg, #7476fc 23%, #ff6f43 65%, #f5217f 96%);
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0 30px 0;
  }

  .logo {
    cursor: pointer;
    margin-left: 5vw;

    @media screen and (min-width: $md) {
      margin-left: 40px;
    }

    &:hover {
      transform: scale(1.02);
    }
  }

  .connect, .wallet {
    margin-right: 5vw;

    @media screen and (min-width: $md) {
      margin-right: 40px;
    }
  }

  .connect {
    white-space: nowrap;
    color: #6b70ed;
    cursor: pointer;

    &:hover {
      font-weight: 500;
    }
  }
</style>

