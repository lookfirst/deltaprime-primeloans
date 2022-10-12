import Vue from 'vue'
import Router from 'vue-router'
import Pool from '@/pages/Pool'
import Ranking from '@/pages/Ranking'
import Nft from "@/pages/Nft";
import BorrowNft from "@/components/BorrowNft";
import DepositNft from "@/components/DepositNft";
import Admin from "@/pages/Admin";
import PrimeAccount from '../pages/PrimeAccount';
import PoolsBeta from '../components/PoolsBeta';


Vue.use(Router)


export default new Router({
  routes: [
    {
      path: '/pool',
      name: 'Pool',
      component: Pool
    },
    {
      path: '/pool-beta',
      name: 'Pools Beta',
      component: PoolsBeta
    },
    {
      path: '/prime-account',
      name: 'Prime Account',
      component: PrimeAccount
    },
    {
      path: '/ranking',
      name: 'Ranking',
      component: Ranking
    },
    {
      path: '/admin',
      name: 'Admin',
      component: Admin
    },
    {
      path: '/nft',
      name: 'Nft',
      component: Nft,
      children: [
        {
          path: 'list',
          component: BorrowNft
        },
        {
          path: 'deposit',
          component: DepositNft
        },
      ],
    },
    {
      path: '*',
      redirect: { name: 'Prime Account' }
    },
  ]
})
