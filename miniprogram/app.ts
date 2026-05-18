// app.ts
App<IAppOption>({
  globalData: {
    userInfo: null,
    systemInfo: null
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV
      });
    } else {
      console.error('基础库版本过低，无法使用云能力');
    }

    // 获取系统信息
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      }
    });

    // 检查更新
    this.checkUpdate();

    // 初始化用户状态
    this.initUserStatus();
  },

  onShow() {
    console.log('App Show');
  },

  onHide() {
    console.log('App Hide');
  },

  // 更新TabBar状态
  updateTabBar(selectedIndex) {
    const tabBar = this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: String(selectedIndex)
      });
    }
  },

  // 检查小程序更新
  checkUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();

      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('发现新版本');
        }
      });

      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });

      updateManager.onUpdateFailed(() => {
        console.error('更新失败');
      });
    }
  },

  // 初始化用户状态
  initUserStatus() {
    const token = wx.getStorageSync('user_token');
    if (token) {
      // 有token，可以获取用户信息
      console.log('用户已登录');
    } else {
      console.log('用户未登录');
    }
  }
})
