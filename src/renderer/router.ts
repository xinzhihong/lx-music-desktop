/* eslint-disable @typescript-eslint/no-var-requires */
// import Vue from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'


const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/search',
      name: 'Search',
      component: require('./views/Search/index.vue').default,
      meta: {
        name: 'Search',
      },
    },
    {
      path: '/kugou',
      name: 'Kugou',
      component: require('./views/Kugou/index.vue').default,
      meta: {
        name: 'Kugou',
      },
    },
    {
      path: '/kugou/login',
      name: 'KugouLogin',
      component: require('./views/Kugou/Login.vue').default,
      meta: {
        name: 'KugouLogin',
      },
    },
    {
      path: '/netease',
      name: 'Netease',
      component: require('./views/Netease/index.vue').default,
      meta: {
        name: 'Netease',
      },
    },
    {
      path: '/netease/login',
      name: 'NeteaseLogin',
      component: require('./views/Netease/Login.vue').default,
      meta: {
        name: 'NeteaseLogin',
      },
    },
    {
      path: '/songList/list',
      name: 'SongList',
      component: require('./views/songList/List/index.vue').default,
      meta: {
        name: 'SongList',
      },
    },
    {
      path: '/songList/detail',
      name: 'SongListDetail',
      component: require('./views/songList/Detail/index.vue').default,
      meta: {
        name: 'SongList',
      },
    },
    {
      path: '/leaderboard',
      name: 'Leaderboard',
      component: require('./views/Leaderboard/index.vue').default,
      meta: {
        name: 'Leaderboard',
      },
    },
    {
      path: '/list',
      name: 'List',
      component: require('./views/List/index.vue').default,
      meta: {
        name: 'List',
      },
    },
    {
      path: '/download',
      name: 'Download',
      component: require('./views/Download/index.vue').default,
      meta: {
        name: 'Download',
      },
    },
    {
      path: '/setting',
      name: 'Setting',
      component: require('./views/Setting/index.vue').default,
      meta: {
        name: 'Setting',
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
  linkActiveClass: 'active-link',
  linkExactActiveClass: 'exact-active-link',
})


let isFirstLoad = true
router.beforeEach((to) => {
  if (isFirstLoad && to.path !== "/search") {
    isFirstLoad = false
    return "/search"
  }
  isFirstLoad = false
  return true
})

export default router
