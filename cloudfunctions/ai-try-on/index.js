const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs-aiart');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const AiartClient = tencentcloud.aiart.v20221229.Client;

const ALLOWED_CLOTHES_TYPES = new Set(['Upper-body', 'Lower-body', 'Dress']);

exports.main = async (event = {}) => {
  const {
    personFileId,
    clothesFileId,
    clothesType,
    responseType = 'url',
    logoAdd,
    logoParam
  } = event;

  if (!personFileId || !clothesFileId || !clothesType) {
    return {
      success: false,
      errorMessage: '缺少必要参数'
    };
  }

  if (!ALLOWED_CLOTHES_TYPES.has(clothesType)) {
    return {
      success: false,
      errorMessage: '不支持的服装类型'
    };
  }

  const secretId = process.env.SECRET_ID;
  const secretKey = process.env.SECRET_KEY;

  if (!secretId || !secretKey) {
    return {
      success: false,
      errorMessage: '未配置腾讯云密钥，请设置 SECRET_ID 和 SECRET_KEY'
    };
  }

  let modelUrl = '';
  let clothesUrl = '';

  try {
    const tempFileRes = await cloud.getTempFileURL({
      fileList: [personFileId, clothesFileId]
    });

    const fileList = tempFileRes.fileList || [];
    if (fileList.length < 2) {
      throw new Error('临时链接获取失败');
    }

    const [personItem, clothesItem] = fileList;

    if (personItem.status && personItem.status !== 0) {
      throw new Error(personItem.errMsg || '无法获取模特图片');
    }
    if (clothesItem.status && clothesItem.status !== 0) {
      throw new Error(clothesItem.errMsg || '无法获取服装图片');
    }

    modelUrl = personItem.tempFileURL;
    clothesUrl = clothesItem.tempFileURL;
  } catch (error) {
    console.error('获取临时链接失败:', error);
    return {
      success: false,
      errorMessage: '获取图片链接失败，请重试'
    };
  }

  if (!modelUrl || !clothesUrl) {
    return {
      success: false,
      errorMessage: '图片链接无效，请检查文件是否存在'
    };
  }

  try {
    const region = process.env.TENCENTCLOUD_REGION || 'ap-shanghai';

    const client = new AiartClient({
      credential: {
        secretId,
        secretKey
      },
      region,
      profile: {
        httpProfile: {
          endpoint: 'aiart.tencentcloudapi.com'
        }
      }
    });

    const params = {
      ModelUrl: modelUrl,
      ClothesUrl: clothesUrl,
      ClothesType: clothesType,
      RspImgType: responseType === 'base64' ? 'base64' : 'url'
    };

    if (typeof logoAdd === 'number') {
      params.LogoAdd = logoAdd;
    }

    if (logoParam && typeof logoParam === 'object') {
      params.LogoParam = logoParam;
    }

    const response = await client.ChangeClothes(params);
    

    if (!response.ResultImage) {
      throw new Error('未返回生成结果');
    }

    return {
      success: true,
      data: {
        imageUrl: response.ResultImage,
        requestId: response.RequestId || ''
      }
    };
  } catch (error) {
    console.error('调用模特换装接口失败:', error);
    const message =
      (error && error.message) ||
      (typeof error === 'string' ? error : '生成失败，请稍后重试');

    return {
      success: false,
      errorMessage: message,
      errorCode: error?.code || error?.name || undefined
    };
  }
};
