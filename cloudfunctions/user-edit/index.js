const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const usersCollection = db.collection('users');

exports.main = async (event) => {
  const { nickname, avatarUrl } = event || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      success: false,
      errorMessage: '无法获取用户身份'
    };
  }

  const sanitizedNickname = typeof nickname === 'string' ? nickname.trim() : '';
  if (!sanitizedNickname) {
    return {
      success: false,
      errorMessage: '昵称不能为空'
    };
  }

  try {
    const userSnapshot = await usersCollection.where({ openid }).limit(1).get();
    if (!userSnapshot.data.length) {
      return {
        success: false,
        errorMessage: '用户不存在'
      };
    }

    const userRecord = userSnapshot.data[0];
    const serverTime = db.serverDate();

    const updates = {
      nickName: sanitizedNickname,
      updatedAt: serverTime
    };

    if (avatarUrl && typeof avatarUrl === 'string') {
      updates.avatarUrl = avatarUrl;
    }

    await usersCollection.doc(userRecord._id).update({
      data: updates
    });

    return {
      success: true,
      data: {
        userId: userRecord._id,
        openid,
        nickname: sanitizedNickname,
        avatarUrl: updates.avatarUrl || userRecord.avatarUrl || ''
      }
    };
  } catch (error) {
    console.error('User edit function error:', error);
    return {
      success: false,
      errorMessage: error.message || '更新失败',
      errorCode: error.errCode || 'UNKNOWN_ERROR'
    };
  }
};
