// try-on.ts

const CLOTHES_TYPE_OPTIONS = [
  { label: '上衣', value: 'Upper-body' },
  { label: '下装', value: 'Lower-body' },
  { label: '连衣裙', value: 'Dress' }
] as const;

let progressTimer: ReturnType<typeof setInterval> | null = null;

Component({
  data: {
    personImage: '',
    clothesImage: '',
    personFileId: '',
    clothesFileId: '',
    uploadingPerson: false,
    uploadingClothes: false,
    clothesTypeOptions: CLOTHES_TYPE_OPTIONS,
    selectedClothesType: CLOTHES_TYPE_OPTIONS[0].value,
    showPopup: false,
    isGenerating: false,
    progress: 0,
    resultImage: '',
    resultRequestId: '',
    savingResult: false,
    canGenerate: false,
  },

  lifetimes: {
    detached() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }
  },

  pageLifetimes: {
    hide() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }
  },

  methods: {
    // 上传个人形象
    onUploadPerson() {
      this.selectAndUploadImage('person');
    },

    // 上传衣服
    onUploadClothes() {
      this.selectAndUploadImage('clothes');
    },

    selectAndUploadImage(type: 'person' | 'clothes') {
      const uploadKey = type === 'person' ? 'uploadingPerson' : 'uploadingClothes';
      if ((this.data as Record<string, any>)[uploadKey]) {
        return;
      }

      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          const tempFilePath = file?.tempFilePath;
          if (!tempFilePath) {
            wx.showToast({
              title: '未获取到图片',
              icon: 'none'
            });
            return;
          }

          const displayKey = type === 'person' ? 'personImage' : 'clothesImage';
          const fileIdKey = type === 'person' ? 'personFileId' : 'clothesFileId';

          this.setData({
            [displayKey]: tempFilePath,
            [fileIdKey]: ''
          });
          this.checkCanGenerate();

          void this.uploadImageToCloud(tempFilePath, type);
        },
        fail: (err) => {
          if (err?.errMsg && err.errMsg.includes('cancel')) {
            return;
          }
          console.error('选择图片失败:', err);
          wx.showToast({
            title: '选择图片失败',
            icon: 'error'
          });
        }
      });
    },

    onClothesTypeChange(e: WechatMiniprogram.CustomEvent) {
      const value = e?.detail?.value as string | undefined;
      if (!value) {
        return;
      }
      this.setData({
        selectedClothesType: value
      });
      this.checkCanGenerate();
    },

    // 检查是否可以生成
    checkCanGenerate() {
      const {
        personFileId,
        clothesFileId,
        selectedClothesType,
        uploadingPerson,
        uploadingClothes
      } = this.data;
      const canGenerate =
        !!personFileId &&
        !!clothesFileId &&
        !!selectedClothesType &&
        !uploadingPerson &&
        !uploadingClothes;
      this.setData({
        canGenerate
      });
    },

    // 点击生成按钮
    onGenerateClick() {
      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      if (!this.data.canGenerate) {
        wx.showToast({
          title: '请先完成图片上传',
          icon: 'none'
        });
        return;
      }

      // 显示生成弹窗
      this.setData({
        showPopup: true,
        isGenerating: true,
        progress: 0,
        resultImage: '',
        resultRequestId: ''
      });

      this.startProgressAnimation();
      void this.performTryOn();
    },

    startProgressAnimation() {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      progressTimer = setInterval(() => {
        const currentProgress = this.data.progress;
        if (currentProgress >= 95) {
          return;
        }
        const increment = Math.floor(Math.random() * 8) + 1;
        const nextProgress = Math.min(currentProgress + increment, 95);
        this.setData({
          progress: nextProgress
        });
      }, 400);
    },

    stopProgressAnimation(finalValue?: number) {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      if (typeof finalValue === 'number') {
        this.setData({
          progress: finalValue
        });
      }
    },

    async performTryOn() {
      const { personFileId, clothesFileId, selectedClothesType } = this.data;
      try {
        const cloudRes = await wx.cloud.callFunction({
          name: 'ai-try-on',
          data: {
            personFileId,
            clothesFileId,
            clothesType: selectedClothesType,
            responseType: 'url'
          }
        });

        const result = cloudRes?.result as {
          success?: boolean;
          data?: {
            imageUrl?: string;
            requestId?: string;
          };
          errorMessage?: string;
        };

        if (!result?.success || !result.data?.imageUrl) {
          throw new Error(result?.errorMessage || '生成失败，请稍后重试');
        }

        this.stopProgressAnimation(100);
        this.setData({
          isGenerating: false,
          progress: 100,
          resultImage: result.data.imageUrl,
          resultRequestId: result.data.requestId || ''
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '生成失败，请稍后重试';
        console.error('AI试衣生成失败:', error);
        this.stopProgressAnimation();
        this.setData({
          isGenerating: false,
          showPopup: false,
          progress: 0,
          resultImage: '',
          resultRequestId: ''
        });
        wx.showToast({
          title: message,
          icon: 'none'
        });
      }
    },

    // 保存结果
    onSaveClick() {
      void this.saveResult();
    },

    // 弹窗可见性变化
    onPopupVisibleChange(e: WechatMiniprogram.CustomEvent) {
      if (!e.detail.visible) {
        this.stopProgressAnimation();
        this.setData({
          showPopup: false
        });
      }
    },

    async uploadImageToCloud(filePath: string, type: 'person' | 'clothes') {
      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      const uploadKey = type === 'person' ? 'uploadingPerson' : 'uploadingClothes';
      const displayKey = type === 'person' ? 'personImage' : 'clothesImage';
      const fileIdKey = type === 'person' ? 'personFileId' : 'clothesFileId';

      this.setData({
        [uploadKey]: true
      });
      wx.showLoading({
        title: '上传中...',
        mask: true
      });

      try {
        const identifier = this.getUploadIdentifier();
        const extension = this.getFileExtension(filePath) || 'jpg';
        const prefix = type === 'person' ? 'person' : 'clothes';
        const randomSuffix = Math.floor(Math.random() * 100000);
        const cloudPath = `user-uploads/${identifier}/${prefix}_${Date.now()}_${randomSuffix}.${extension}`;

        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath
        });

        let accessibleUrl = '';

        try {
          const tempUrlRes = await wx.cloud.getTempFileURL({
            fileList: [uploadRes.fileID]
          });
          const fileList = tempUrlRes.fileList || [];
          if (fileList.length) {
            const item = fileList[0];
            if (!item.status || item.status === 0) {
              accessibleUrl = item.tempFileURL || '';
            }
          }
        } catch (err) {
          console.warn('获取临时链接失败，将使用本地路径展示', err);
        }

        const currentDisplay = (this.data as Record<string, any>)[displayKey] as string;
        const displayUrl = accessibleUrl || currentDisplay || filePath;

        this.setData({
          [displayKey]: displayUrl,
          [fileIdKey]: uploadRes.fileID
        });
      } catch (error) {
        console.error('上传图片失败:', error);
        wx.showToast({
          title: '上传失败，请重试',
          icon: 'error'
        });
        this.setData({
          [displayKey]: '',
          [fileIdKey]: ''
        });
      } finally {
        wx.hideLoading();
        this.setData({
          [uploadKey]: false
        });
        this.checkCanGenerate();
      }
    },

    getUploadIdentifier() {
      const userId = wx.getStorageSync('user_id');
      const userToken = wx.getStorageSync('user_token');
      const raw = (typeof userId === 'string' && userId.trim()) || (typeof userToken === 'string' && userToken.trim()) || '';
      const sanitized = raw.replace(/[^\w-]/g, '');
      return sanitized || 'guest';
    },

    getFileExtension(path: string) {
      const match = path && path.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      return match ? match[1].toLowerCase() : '';
    },

    async saveResult() {
      if (this.data.savingResult) {
        return;
      }

      if (!this.data.resultImage) {
        wx.showToast({
          title: '没有可保存的结果',
          icon: 'error'
        });
        return;
      }

      if (!wx.cloud) {
        wx.showToast({
          title: '当前微信版本暂不支持云能力',
          icon: 'none'
        });
        return;
      }

      this.setData({
        savingResult: true
      });
      wx.showLoading({
        title: '保存中...',
        mask: true
      });

      try {
        const cloudRes = await wx.cloud.callFunction({
          name: 'try-on-handlers',
          data: {
            action: 'saveResult',
            resultImageUrl: this.data.resultImage,
            personFileId: this.data.personFileId,
            clothesFileId: this.data.clothesFileId,
            clothesType: this.data.selectedClothesType,
            requestId: this.data.resultRequestId
          }
        });

        const result = cloudRes?.result as {
          success?: boolean;
          data?: { imageUrl?: string };
          errorMessage?: string;
        };

        if (!result || !result.success) {
          throw new Error(result?.errorMessage || '保存失败，请稍后重试');
        }

        if (result.data?.imageUrl) {
          this.setData({
            resultImage: result.data.imageUrl
          });
        }

        wx.hideLoading();
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });

        setTimeout(() => {
          this.setData({
            showPopup: false
          });
          wx.switchTab({
            url: '/pages/profile/profile'
          });
        }, 800);
      } catch (error) {
        console.error('保存试衣结果失败:', error);
        wx.showToast({
          title: error instanceof Error ? error.message : '保存失败，请稍后重试',
          icon: 'none'
        });
      } finally {
        wx.hideLoading();
        this.setData({
          savingResult: false
        });
      }
    }
  },
});
