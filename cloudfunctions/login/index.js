const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const usersCollection = db.collection('users');

exports.main = async (event) => {
  const { code, userInfo = {} } = event || {};

  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const unionid = wxContext.UNIONID || '';

    if (!openid) {
      return {
        success: false,
        errorMessage: '未获取到 openid'
      };
    }

    const serverTime = db.serverDate();
    const existing = await usersCollection.where({ openid }).limit(1).get();

    let userRecord;
    let isNewUser = false;

    if (!existing.data.length) {
      isNewUser = true;
      const sanitizedNickName = sanitizeString(userInfo.nickName);
      const sanitizedAvatar = sanitizeString(userInfo.avatarUrl);

      const newUser = {
        openid,
        unionid,
        loginCode: code || '',
        nickName: sanitizedNickName,
        avatarUrl: sanitizedAvatar,
        gender: typeof userInfo.gender === 'number' ? userInfo.gender : null,
        country: userInfo.country || '',
        province: userInfo.province || '',
        city: userInfo.city || '',
        createdAt: serverTime,
        updatedAt: serverTime,
        lastLoginAt: serverTime
      };

      const addRes = await usersCollection.add({
        data: newUser
      });

      userRecord = {
        _id: addRes._id,
        ...newUser
      };
    } else {
      userRecord = existing.data[0];

      await usersCollection.doc(userRecord._id).update({
        data: {
          lastLoginAt: serverTime
        }
      });

      userRecord = {
        ...userRecord,
        lastLoginAt: serverTime
      };
    }

    return {
      success: true,
      data: {
        openid,
        unionid,
        userId: userRecord._id,
        isNewUser,
        avatarUrl: userRecord.avatarUrl || '',
        nickname: userRecord.nickName || ''
      }
    };
  } catch (error) {
    console.error('Login function error:', error);
    return {
      success: false,
      errorMessage: error.message || '登录失败',
      errorCode: error.errCode || 'UNKNOWN_ERROR'
    };
  }
};

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
}
