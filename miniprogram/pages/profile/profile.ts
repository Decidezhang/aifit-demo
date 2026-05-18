// profile.ts
interface UserInfo {
  avatar: string;
  nickname: string;
  avatarFileId?: string;
}

interface TryOnWork {
  id: string;
  imageUrl: string;
  createTime: string;
  status: 'published' | 'private';
  imageFileId?: string;
  clothesType?: string;
  publishedAt?: string;
}

interface ActionSheetOption {
  label: string;
  color?: string;
  value?: string;
}

Component({
  data: {
    isLoggedIn: false,
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    userInfo: {
      avatar: '',
      nickname: '',
    } as UserInfo,
    myTryOnImages: [] as TryOnWork[],
    actionSheetVisible: false,
    actionSheetItems: [] as ActionSheetOption[],
    currentWorkId: '',
    actionSheetSource: null as 'work' | 'profile' | null,
    loginInProgress: false,
    loadingMyWorks: false,
  },

  lifetimes: {
    attached() {
      this.checkLoginStatus();
    }
  },

  pageLifetimes: {
    show() {
      // 页面显示时检查登录状态和数据
      this.checkLoginStatus();
      // 更新TabBar状态
      try {
        const tabBar = this.getTabBar();
        if (tabBar) {
          tabBar.setData({
            selected: '1'
          });
        }
      } catch (error) {
        console.log('TabBar not available:', error);
      }
    }
  },

  methods: {
    // 检查登录状态
    checkLoginStatus() {
      const token = wx.getStorageSync('user_token');
      if (!token) {
        this.setData({
          isLoggedIn: false,
          myTryOnImages: []
        });
        return;
      }

      wx.checkSession({
        success: () => {
          this.setData({
            isLoggedIn: true
          });
          this.loadUserData();
          this.loadMyWorks();
        },
        fail: () => {
          this.clearAuthStorage();
          this.setData({
            isLoggedIn: false,
            myTryOnImages: []
          });
        }
      });
    },

    // 清理登录信息
    clearAuthStorage() {
      wx.removeStorageSync('user_token');
      wx.removeStorageSync('user_profile');
      wx.removeStorageSync('user_id');
    },

    // 加载用户数据
    loadUserData() {
      const storedProfile = wx.getStorageSync('user_profile') as Partial<UserInfo> | undefined;
      const defaultNickname = '时尚达人';
      const defaultAvatar = this.data.defaultAvatar;

      let userProfile: UserInfo = {
        avatar: defaultAvatar,
        nickname: defaultNickname,
        avatarFileId: ''
      };

      if (storedProfile && typeof storedProfile === 'object') {
        const storedAvatar = typeof storedProfile.avatar === 'string' ? storedProfile.avatar.trim() : '';
        const storedNickname = typeof storedProfile.nickname === 'string' ? storedProfile.nickname.trim() : '';
        const storedAvatarFileId = typeof storedProfile.avatarFileId === 'string' ? storedProfile.avatarFileId.trim() : '';

        userProfile = {
          avatar: storedAvatar || defaultAvatar,
          nickname: storedNickname || defaultNickname,
          avatarFileId: storedAvatarFileId
        };
      }

      this.setData({
        userInfo: userProfile
      });

      const candidateFileId = this.resolveAvatarFileIdCandidate(userProfile);
      if (candidateFileId) {
        this.fetchAvatarUrl(candidateFileId);
      }
    },

    // 加载用户的试衣作品
    async loadMyWorks() {
      if (!wx.cloud) {
        return;
      }

      this.setData({
        loadingMyWorks: true
      });

      try {
        const cloudRes = await wx.cloud.callFunction({
          name: 'try-on-handlers',
          data: {
            action: 'getMyList'
          }
        });

        const result = cloudRes?.result as {
          success?: boolean;
          data?: { items?: Array<Record<string, any>> };
          errorMessage?: string;
        };

        if (!result || !result.success || !result.data?.items) {
          throw new Error(result?.errorMessage || '加载失败，请稍后重试');
        }

        const works: TryOnWork[] = result.data.items.map((item) => ({
          id: item.id,
          imageUrl: item.imageUrl || '',
          createTime: item.createdAtText || '',
          status: item.isPublished ? 'published' : 'private',
          imageFileId: item.imageFileId || '',
          clothesType: item.clothesType || '',
          publishedAt: item.publishedAtText || ''
        }));

        this.setData({
          myTryOnImages: works
        });
      } catch (error) {
        console.error('加载试衣作品失败:', error);
        wx.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none'
        });
        this.setData({
          myTryOnImages: []
        });
      } finally {
        this.setData({
          loadingMyWorks: false
        });
      }
    },

    // 登录
    onLoginClick() {
      if (this.data.loginInProgress) {
        return;
      }

      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      const proceedLogin = (profile?: WechatMiniprogram.UserInfo) => {
        this.setData({
          loginInProgress: true
        });
        void this.performLogin(profile);
      };

      if (typeof wx.getUserProfile === 'function') {
        wx.getUserProfile({
          desc: '用于完善个人资料',
          lang: 'zh_CN',
          success: (res) => {
            proceedLogin(res.userInfo);
          },
          fail: () => {
            wx.showToast({
              title: '已取消授权',
              icon: 'none'
            });
          }
        });
      } else {
        proceedLogin();
      }
    },

    async performLogin(profile?: WechatMiniprogram.UserInfo) {
      wx.showLoading({
        title: '登录中...',
        mask: true
      });

      try {
        const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
          wx.login({
            timeout: 5000,
            success: resolve,
            fail: reject
          });
        });

        if (!loginRes.code) {
          throw new Error('未获取到登录凭证');
        }

        const sanitizedUserInfo = profile
          ? {
              nickName: profile.nickName,
              avatarUrl: profile.avatarUrl,
              gender: profile.gender,
              country: profile.country,
              province: profile.province,
              city: profile.city
            }
          : undefined;

        console.log('调用微信云开发')

        const cloudRes = await wx.cloud.callFunction({
          name: 'login',
          data: {
            code: loginRes.code,
            userInfo: sanitizedUserInfo
          }
        });

        console.log('调用微信云开发结束', cloudRes)

        const result = cloudRes?.result as {
          success?: boolean;
          data?: {
            openid: string;
            unionid?: string;
            userId?: string;
            isNewUser?: boolean;
          };
          errorMessage?: string;
        };

        if (!result || !result.success || !result.data) {
          throw new Error(result?.errorMessage || '登录失败，请稍后重试');
        }

        const { openid, userId, isNewUser, avatarUrl: storedAvatarUrl, nickname: storedNickname } = result.data;
        const formattedProfile = this.formatUserProfile(profile);

        if (typeof storedNickname === 'string' && storedNickname.trim()) {
          formattedProfile.nickname = storedNickname.trim();
        }

        if (typeof storedAvatarUrl === 'string' && storedAvatarUrl.trim()) {
          const trimmedStoredAvatar = storedAvatarUrl.trim();
          if (this.isCloudFilePath(trimmedStoredAvatar)) {
            formattedProfile.avatarFileId = trimmedStoredAvatar;
          } else {
            formattedProfile.avatar = trimmedStoredAvatar;
            formattedProfile.avatarFileId = '';
          }
        }

        wx.setStorageSync('user_token', openid);
        if (userId) {
          wx.setStorageSync('user_id', userId);
        }
        wx.setStorageSync('user_profile', formattedProfile);

        this.setData({
          isLoggedIn: true,
          userInfo: formattedProfile
        });

        if (formattedProfile.avatarFileId && this.isCloudFilePath(formattedProfile.avatarFileId)) {
          this.fetchAvatarUrl(formattedProfile.avatarFileId);
        }

        this.loadMyWorks();

        wx.hideLoading();
        wx.showToast({
          title: isNewUser ? '注册成功' : '登录成功',
          icon: 'success'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录失败';
        wx.hideLoading();
        wx.showToast({
          title: message,
          icon: 'none'
        });
      } finally {
        wx.hideLoading();
        this.setData({
          loginInProgress: false
        });
      }
    },

    formatUserProfile(profile?: WechatMiniprogram.UserInfo, options?: { avatarFileId?: string; avatarUrl?: string }): UserInfo {
      const defaultAvatar = this.data.defaultAvatar;
      const defaultNickname = '时尚达人';

      const providedAvatarFileId = options?.avatarFileId;
      const providedAvatarUrl = options?.avatarUrl;

      if (providedAvatarFileId) {
        return {
          avatar: providedAvatarUrl || providedAvatarFileId,
          nickname: profile?.nickName?.trim() || defaultNickname,
          avatarFileId: providedAvatarFileId
        };
      }

      if (!profile) {
        return {
          avatar: defaultAvatar,
          nickname: defaultNickname,
          avatarFileId: ''
        };
      }

      const avatarUrl = typeof profile.avatarUrl === 'string' ? profile.avatarUrl.trim() : '';
      const nickName = typeof profile.nickName === 'string' ? profile.nickName.trim() : '';

      return {
        avatar: avatarUrl || defaultAvatar,
        nickname: nickName || defaultNickname,
        avatarFileId: ''
      };
    },

    resolveAvatarFileIdCandidate(userProfile: UserInfo) {
      if (this.isCloudFilePath(userProfile.avatarFileId)) {
        return userProfile.avatarFileId;
      }
      if (this.isCloudFilePath(userProfile.avatar)) {
        return userProfile.avatar;
      }
      return '';
    },

    isCloudFilePath(target?: string) {
      return typeof target === 'string' && target.startsWith('cloud://');
    },

    fetchAvatarUrl(fileId: string) {
      if (!wx.cloud) {
        return;
      }

      wx.cloud
        .getTempFileURL({
          fileList: [fileId]
        })
        .then((res) => {
          const fileList = res.fileList || [];
          if (!fileList.length) {
            return;
          }
          const item = fileList[0];
          if (item.tempFileURL) {
            const updatedProfile: UserInfo = {
              ...this.data.userInfo,
              avatar: item.tempFileURL,
              avatarFileId: fileId
            };
            this.setData({
              userInfo: updatedProfile
            });
            wx.setStorageSync('user_profile', updatedProfile);
          }
        })
        .catch((error) => {
          console.warn('获取头像临时链接失败:', error);
        });
    },

    // 预览作品图片
    onWorkImageTap(e: WechatMiniprogram.TouchEvent) {
      const { id } = e.currentTarget.dataset as { id: string };
      const work = this.getWorkById(id);
      if (!work) {
        return;
      }
      wx.previewImage({
        current: work.imageUrl,
        urls: [work.imageUrl]
      });
    },

    // 点击发布/取消发布按钮
    onPublishTap(e: WechatMiniprogram.TouchEvent) {
      const { id, status } = e.currentTarget.dataset as { id: string; status: string };
      if (!id) {
        return;
      }
      this.handleTogglePublish(id);
    },

    // 打开操作菜单
    onWorkCardTap(e: WechatMiniprogram.TouchEvent) {
      const { id } = e.currentTarget.dataset as { id: string };
      const work = this.getWorkById(id);
      if (!work) {
        return;
      }

      const actionSheetItems: ActionSheetOption[] = [
        {
          label: work.status === 'published' ? '取消发布' : '发布',
          value: 'publish-toggle'
        }
      ];

      this.showActionSheet('work', actionSheetItems, id);
    },

    onActionSheetSelected(e: WechatMiniprogram.CustomEvent) {
      const { selected } = e.detail || {};
      if (!selected) {
        this.resetActionSheet();
        return;
      }

      const option = typeof selected === 'string' ? { value: selected, label: selected } : selected;
      const { actionSheetSource, currentWorkId } = this.data;

      if (actionSheetSource === 'work') {
        if (!currentWorkId) {
          this.resetActionSheet();
          return;
        }
        if (option.value === 'publish-toggle') {
          this.handleTogglePublish(currentWorkId);
        }
      } else if (actionSheetSource === 'profile') {
        if (option.value === 'edit-profile') {
          wx.navigateTo({
            url: '/pages/profile-setting/profile-setting'
          });
        } else if (option.value === 'logout') {
          this.handleLogout();
        }
      }

      this.resetActionSheet();
    },

    // 用户信息入口
    onUserInfoTap() {
      if (!this.data.isLoggedIn) {
        return;
      }

      const profileOptions: ActionSheetOption[] = [
        {
          label: '编辑资料',
          value: 'edit-profile'
        },
        {
          label: '退出登录',
          value: 'logout',
          color: '#E34D59'
        }
      ];

      this.showActionSheet('profile', profileOptions);
    },

    onActionSheetCancel() {
      this.resetActionSheet();
    },

    onActionSheetClose() {
      this.resetActionSheet();
    },

    showActionSheet(source: 'work' | 'profile', items: ActionSheetOption[], workId: string | null = null) {
      this.setData({
        actionSheetSource: source,
        actionSheetItems: items,
        actionSheetVisible: true,
        currentWorkId: workId || ''
      });
    },

    handleTogglePublish(workId: string) {
      void this.updatePublishStatus(workId);
    },

    async updatePublishStatus(workId: string) {
      if (!workId) {
        return;
      }

      const target = this.getWorkById(workId);
      if (!target) {
        return;
      }

      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      const publish = target.status !== 'published';

      wx.showLoading({
        title: publish ? '正在发布...' : '正在取消发布...',
        mask: true
      });

      try {
        const cloudRes = await wx.cloud.callFunction({
          name: 'try-on-handlers',
          data: {
            action: 'togglePublish',
            recordId: workId,
            publish
          }
        });

        const result = cloudRes?.result as {
          success?: boolean;
          data?: { isPublished?: boolean; publishedAtText?: string };
          errorMessage?: string;
        };

        if (!result || !result.success) {
          throw new Error(result?.errorMessage || '操作失败，请稍后重试');
        }

        const isPublished = !!result.data?.isPublished;
        const publishedAtText = result.data?.publishedAtText || '';

        const updatedList = this.data.myTryOnImages.map(item => {
          if (item.id !== workId) {
            return item;
          }
          return {
            ...item,
            status: isPublished ? 'published' : 'private',
            publishedAt: publishedAtText
          };
        });

        this.setData({
          myTryOnImages: updatedList
        });

        wx.showToast({
          title: isPublished ? '已发布' : '已取消发布',
          icon: 'success'
        });
      } catch (error) {
        console.error('更新发布状态失败:', error);
        wx.showToast({
          title: error instanceof Error ? error.message : '操作失败',
          icon: 'none'
        });
      } finally {
        wx.hideLoading();
      }
    },

    handleLogout() {
      wx.showModal({
        title: '确认退出',
        content: '退出登录后将无法查看您的试衣作品，确定要退出吗？',
        success: (res) => {
          if (res.confirm) {
            wx.removeStorageSync('user_token');
            wx.removeStorageSync('user_profile');
            this.setData({
              isLoggedIn: false,
              userInfo: {
                avatar: '',
                nickname: '',
                avatarFileId: ''
              },
              myTryOnImages: []
            });
            wx.showToast({
              title: '已退出登录',
              icon: 'success'
            });
          }
        }
      });
    },

    getWorkById(workId: string) {
      return this.data.myTryOnImages.find(item => item.id === workId);
    },

    resetActionSheet() {
      this.setData({
        actionSheetVisible: false,
        actionSheetItems: [],
        currentWorkId: '',
        actionSheetSource: null
      });
    },

    // 立即试衣
    onTryNowClick() {
      wx.navigateTo({
        url: '/pages/try-on/try-on'
      });
    }
  },
})
