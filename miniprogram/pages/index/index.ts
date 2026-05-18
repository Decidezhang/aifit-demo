// index.ts
interface TryOnImage {
  id: string;
  imageUrl: string;
  userAvatar: string;
  username: string;
  createTime: string;
}

const DEFAULT_AVATAR = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

Component({
  data: {
    tryOnImages: [] as TryOnImage[],
    loading: false,
  },

  lifetimes: {
    attached() {
      this.loadTryOnImages();
    }
  },

  pageLifetimes: {
    show() {
      // 页面显示时更新TabBar状态
      try {
        const tabBar = this.getTabBar();
        if (tabBar) {
          tabBar.setData({
            selected: '0'
          });
        }
      } catch (error) {
        console.log('TabBar not available:', error);
      }
    }
  },

  methods: {
    // 加载试衣图片数据
    loadTryOnImages() {
      if (!wx.cloud) {
        return;
      }

      this.setData({
        loading: true
      });

      wx.cloud
        .callFunction({
          name: 'try-on-handlers',
          data: {
            action: 'getPublishedList',
            limit: 20
          }
        })
        .then((res) => {
          const result = res?.result as {
            success?: boolean;
            data?: { items?: Array<Record<string, any>> };
            errorMessage?: string;
          };

          if (!result || !result.success || !result.data?.items) {
            throw new Error(result?.errorMessage || '加载失败，请稍后重试');
          }

          const mapped: TryOnImage[] = result.data.items.map((item) => ({
            id: item.id,
            imageUrl: item.imageUrl || '',
            userAvatar: item.userAvatar || DEFAULT_AVATAR,
            username: item.username || '时尚达人',
            createTime: item.publishedAtText || item.createdAtText || ''
          }));

          this.setData({
            tryOnImages: mapped
          });
        })
        .catch((error) => {
          console.error('加载已发布试衣列表失败:', error);
          wx.showToast({
            title: error instanceof Error ? error.message : '加载失败',
            icon: 'none'
          });
          this.setData({
            tryOnImages: []
          });
        })
        .finally(() => {
          this.setData({
            loading: false
          });
        });
    },

    // 点击卡片查看详情
    onCardTap(e: any) {
      const item = e.currentTarget.dataset.item;
      wx.previewImage({
        current: item.imageUrl,
        urls: [item.imageUrl]
      });
    },

    // 点击添加按钮跳转到试衣页面
    onAddClick() {
      wx.navigateTo({
        url: '/pages/try-on/try-on'
      });
    }
  },
})
