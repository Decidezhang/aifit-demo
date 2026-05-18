// profile-setting.ts
interface UserProfile {
  avatar: string;
  nickname: string;
  avatarFileId?: string;
}

Component({
  data: {
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    avatar: '',
    nickname: '',
    avatarFileId: '',
    avatarTempFile: '',
    saving: false
  },

  lifetimes: {
    attached() {
      this.loadProfile();
    }
  },

  methods: {
    loadProfile() {
      const storedProfile = wx.getStorageSync('user_profile') as Partial<UserProfile> | undefined;
      const defaultNickname = '时尚达人';
      const defaultAvatar = this.data.defaultAvatar;

      let avatar = defaultAvatar;
      let nickname = defaultNickname;
      let avatarFileId = '';

      if (storedProfile && typeof storedProfile === 'object') {
        const storedAvatar = typeof storedProfile.avatar === 'string' ? storedProfile.avatar.trim() : '';
        const storedNickname = typeof storedProfile.nickname === 'string' ? storedProfile.nickname.trim() : '';
        const storedAvatarFileId = typeof storedProfile.avatarFileId === 'string' ? storedProfile.avatarFileId.trim() : '';

        avatar = storedAvatar || defaultAvatar;
        nickname = storedNickname || defaultNickname;
        avatarFileId = storedAvatarFileId;
      }

      this.setData({
        avatar,
        nickname,
        avatarFileId,
        avatarTempFile: ''
      });

      const candidateFileId = this.resolveAvatarFileIdCandidate(avatar, avatarFileId);
      if (candidateFileId) {
        this.fetchAvatarTempUrl(candidateFileId);
      }
    },

    onChooseAvatar() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          if (file && file.tempFilePath) {
            this.setData({
              avatar: file.tempFilePath,
              avatarTempFile: file.tempFilePath,
              avatarFileId: ''
            });
          }
        },
        fail: (err) => {
          if (err?.errMsg && err.errMsg.includes('cancel')) {
            return;
          }
          console.error('选择头像失败:', err);
          wx.showToast({
            title: '选择头像失败',
            icon: 'error'
          });
        }
      });
    },

    onNicknameInput(e: WechatMiniprogram.Input) {
      const value = e.detail.value || '';
      this.setData({
        nickname: value
      });
    },

    async onSave() {
      if (this.data.saving) {
        return;
      }

      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      const trimmedNickname = (this.data.nickname || '').trim();
      if (!trimmedNickname) {
        wx.showToast({
          title: '请输入用户名',
          icon: 'none'
        });
        return;
      }

      this.setData({
        saving: true
      });

      wx.showLoading({
        title: '保存中...',
        mask: true
      });

      try {
        const userToken = wx.getStorageSync('user_token');
        if (!userToken) {
          throw new Error('请先登录后再修改资料');
        }

        const userId = wx.getStorageSync('user_id');

        let avatarFileId = this.data.avatarFileId;
        let avatarDisplayUrl = this.data.avatar ? this.data.avatar : this.data.defaultAvatar;

        if (this.data.avatarTempFile) {
          const uploadResult = await this.uploadAvatar(
            this.data.avatarTempFile,
            (userId && typeof userId === 'string' ? userId : '') || userToken
          );
          avatarFileId = uploadResult.fileID;
          avatarDisplayUrl = uploadResult.tempFileURL || avatarFileId;
        }

        const cloudRes = await wx.cloud.callFunction({
          name: 'user-edit',
          data: {
            nickname: trimmedNickname,
            avatarUrl: avatarFileId
          }
        });

        const result = cloudRes?.result as {
          success?: boolean;
          data?: {
            nickname?: string;
            avatarUrl?: string;
          };
          errorMessage?: string;
        };

        if (!result || !result.success) {
          throw new Error(result?.errorMessage || '保存失败，请稍后再试');
        }

        if (!avatarFileId && result.data?.avatarUrl) {
          avatarFileId = result.data.avatarUrl;
        }

        const nextProfile: UserProfile = {
          avatar: avatarDisplayUrl,
          nickname: trimmedNickname,
          avatarFileId
        };

        wx.setStorageSync('user_profile', nextProfile);

        this.setData({
          avatar: avatarDisplayUrl,
          avatarFileId,
          avatarTempFile: ''
        });

        wx.showToast({
          title: '已保存',
          icon: 'success',
          duration: 1500
        });

        setTimeout(() => {
          wx.navigateBack({
            delta: 1
          });
        }, 600);
      } catch (error) {
        console.error('保存用户资料失败:', error);
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'error'
        });
      } finally {
        wx.hideLoading();
        this.setData({
          saving: false
        });
      }
    },

    async uploadAvatar(filePath: string, identifier: string) {
      const extension = this.getFileExtension(filePath) || 'jpg';
      const timestamp = Date.now();
      const baseIdentifier = typeof identifier === 'string' ? identifier : '';
      const safeIdentifier = baseIdentifier.replace(/[^\w-]/g, '') || 'user';
      const cloudPath = `user-avatars/${safeIdentifier}_${timestamp}.${extension}`;

      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });

      let tempFileURL = '';

      try {
        const tempUrlRes = await wx.cloud.getTempFileURL({
          fileList: [uploadRes.fileID]
        });
        if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
          const item = tempUrlRes.fileList[0];
          if (!item.status || item.status === 0) {
            tempFileURL = item.tempFileURL || '';
          }
        }
      } catch (err) {
        console.warn('获取头像临时链接失败，使用 fileID 作为展示路径', err);
      }

      return {
        fileID: uploadRes.fileID,
        tempFileURL
      };
    },

    getFileExtension(path: string) {
      const matched = path.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      return matched ? matched[1].toLowerCase() : '';
    },

    resolveAvatarFileIdCandidate(avatar: string, avatarFileId: string) {
      if (this.isCloudFilePath(avatarFileId)) {
        return avatarFileId;
      }
      if (this.isCloudFilePath(avatar)) {
        return avatar;
      }
      return '';
    },

    isCloudFilePath(path: string) {
      return typeof path === 'string' && path.startsWith('cloud://');
    },

    fetchAvatarTempUrl(fileId: string) {
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
            this.setData({
              avatar: item.tempFileURL,
              avatarFileId: fileId,
              avatarTempFile: ''
            });
          }
        })
        .catch((error) => {
          console.warn('获取头像临时链接失败:', error);
        });
    }
  }
})
