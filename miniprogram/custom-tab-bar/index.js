Component({
  data: {
    selected: '0',
    list: [
      {
        pagePath: "/pages/index/index",
        text: "AI衣橱"
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的"
      }
    ]
  },
  attached() {
    // 延迟一点时间再设置，确保页面已经加载完成
    setTimeout(() => {
      this.setSelected();
    }, 100);
  },
  methods: {
    onTabChange(e) {
      const value = String(e.detail.value);
      const targetIndex = Number(e.detail.value);
      const targetTab = this.data.list[targetIndex];
      if (targetTab) {
        wx.switchTab({ url: targetTab.pagePath });
        this.setData({
          selected: value
        });
      }
    },
    setSelected() {
      const pages = getCurrentPages();
      if (pages && pages.length > 0) {
        const currentPage = pages[pages.length - 1];
        if (currentPage && currentPage.route) {
          const route = currentPage.route;
          const selected = this.data.list.findIndex(item =>
            item.pagePath === `/${route}`
          );
          if (selected !== -1) {
            this.setData({
              selected: String(selected)
            });
          }
        }
      }
    }
  }
});
