const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const aiCollection = db.collection('ai-generate');
const usersCollection = db.collection('users');

const ALLOWED_CLOTHES_TYPES = new Set(['Upper-body', 'Lower-body', 'Dress']);

exports.main = async (event = {}, context) => {
  const action = event.action;
  const wxContext = cloud.getWXContext();

  if (!action) {
    return {
      success: false,
      errorMessage: '缺少 action 参数'
    };
  }

  try {
    switch (action) {
      case 'saveResult':
        return await handleSaveResult(event, wxContext);
      case 'getMyList':
        return await handleGetMyList(wxContext);
      case 'togglePublish':
        return await handleTogglePublish(event, wxContext);
      case 'getPublishedList':
        return await handleGetPublishedList(event);
      default:
        return {
          success: false,
          errorMessage: `未支持的 action: ${action}`
        };
    }
  } catch (error) {
    console.error(`try-on-handlers action=${action} error:`, error);
    return {
      success: false,
      errorMessage: error.message || '服务异常，请稍后重试'
    };
  }
};

async function handleSaveResult(event, wxContext) {
  const {
    resultImageUrl,
    personFileId = '',
    clothesFileId = '',
    clothesType = '',
    requestId = ''
  } = event;

  if (!resultImageUrl) {
    throw new Error('缺少 resultImageUrl');
  }

  if (clothesType && !ALLOWED_CLOTHES_TYPES.has(clothesType)) {
    throw new Error('不支持的服装类型');
  }

  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error('无法获取用户身份');
  }

  const userRecord = await getUserRecord(openid);

  const fileBuffer = await downloadImageBuffer(resultImageUrl);
  const fileExtension = inferFileExtension(resultImageUrl, fileBuffer.contentType);
  const uploadPath = buildFilePath(openid, fileExtension);

  const uploadRes = await cloud.uploadFile({
    cloudPath: uploadPath,
    fileContent: fileBuffer.buffer
  });

  const now = db.serverDate();

  const record = {
    openid,
    userId: userRecord?._id || '',
    userSnapshot: userRecord
      ? {
          nickname: userRecord.nickName || '',
          avatar: userRecord.avatarUrl || ''
        }
      : {
          nickname: '',
          avatar: ''
        },
    imageFileId: uploadRes.fileID,
    clothesType: clothesType || '',
    personFileId,
    clothesFileId,
    requestId,
    isPublished: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };

  const addRes = await aiCollection.add({
    data: record
  });

  const tempUrl = await getTempUrl(uploadRes.fileID);

  return {
    success: true,
    data: {
      id: addRes._id,
      imageUrl: tempUrl,
      imageFileId: uploadRes.fileID,
      isPublished: false,
      clothesType: record.clothesType,
      createdAt: Date.now(),
      createdAtText: formatTimestamp(Date.now())
    }
  };
}

async function handleGetMyList(wxContext) {
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error('无法获取用户身份');
  }

  const snapshot = await aiCollection
    .where({
      openid
    })
    .orderBy('createdAt', 'desc')
    .get();

  const records = snapshot.data || [];
  const fileIds = Array.from(new Set(records.map((item) => item.imageFileId).filter(Boolean)));
  const tempUrlMap = await getTempUrlMap(fileIds);

  const items = records.map((item) => ({
    id: item._id,
    imageFileId: item.imageFileId,
    imageUrl: tempUrlMap.get(item.imageFileId) || '',
    clothesType: item.clothesType || '',
    isPublished: !!item.isPublished,
    createdAt: toTimestamp(item.createdAt),
    createdAtText: formatTimestamp(toTimestamp(item.createdAt)),
    publishedAt: item.publishedAt ? toTimestamp(item.publishedAt) : null,
    publishedAtText: item.publishedAt ? formatTimestamp(toTimestamp(item.publishedAt)) : '',
    requestId: item.requestId || ''
  }));

  return {
    success: true,
    data: {
      items
    }
  };
}

async function handleTogglePublish(event, wxContext) {
  const { recordId, publish } = event;

  if (!recordId) {
    throw new Error('缺少 recordId');
  }

  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error('无法获取用户身份');
  }

  const docRes = await aiCollection.doc(recordId).get();
  const record = docRes.data;
  if (!record) {
    throw new Error('记录不存在');
  }

  if (record.openid !== openid) {
    throw new Error('无权操作该记录');
  }

  const now = db.serverDate();
  const updateData = {
    isPublished: !!publish,
    updatedAt: now,
    publishedAt: publish ? now : null
  };

  await aiCollection.doc(recordId).update({
    data: updateData
  });

  return {
    success: true,
    data: {
      recordId,
      isPublished: !!publish,
      publishedAt: publish ? Date.now() : null,
      publishedAtText: publish ? formatTimestamp(Date.now()) : ''
    }
  };
}

async function handleGetPublishedList(event) {
  const limit = typeof event.limit === 'number' && event.limit > 0 ? Math.min(event.limit, 50) : 20;

  const snapshot = await aiCollection
    .where({
      isPublished: true
    })
    .orderBy('publishedAt', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const records = snapshot.data || [];
  const fileIds = Array.from(new Set(records.map((item) => item.imageFileId).filter(Boolean)));
  const tempUrlMap = await getTempUrlMap(fileIds);

  const items = records.map((item) => {
    const createdAtTs = toTimestamp(item.createdAt);
    const publishedAtTs = item.publishedAt ? toTimestamp(item.publishedAt) : createdAtTs;
    return {
      id: item._id,
      imageFileId: item.imageFileId,
      imageUrl: tempUrlMap.get(item.imageFileId) || '',
      clothesType: item.clothesType || '',
      createdAt: createdAtTs,
      createdAtText: formatTimestamp(createdAtTs),
      publishedAt: publishedAtTs,
      publishedAtText: formatTimestamp(publishedAtTs),
      userAvatar: item?.userSnapshot?.avatar || '',
      username: item?.userSnapshot?.nickname || ''
    };
  });

  return {
    success: true,
    data: {
      items
    }
  };
}

async function getUserRecord(openid) {
  if (!openid) {
    return null;
  }
  const res = await usersCollection
    .where({
      openid
    })
    .limit(1)
    .get();
  if (!res.data || !res.data.length) {
    return null;
  }
  return res.data[0];
}

async function downloadImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('下载图片失败');
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || ''
  };
}

function inferFileExtension(url, contentType) {
  if (contentType.includes('png')) {
    return 'png';
  }
  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    return 'jpg';
  }
  if (contentType.includes('webp')) {
    return 'webp';
  }
  if (contentType.includes('gif')) {
    return 'gif';
  }

  const matched = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (matched && matched[1]) {
    return matched[1].toLowerCase();
  }

  return 'jpg';
}

function buildFilePath(openid, extension) {
  const safeOpenid = (openid || 'anonymous').replace(/[^\w-]/g, '');
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return `ai-generate/${safeOpenid}/${timestamp}_${random}.${extension}`;
}

async function getTempUrl(fileId) {
  if (!fileId) {
    return '';
  }
  const res = await cloud.getTempFileURL({
    fileList: [fileId]
  });
  const fileList = res.fileList || [];
  if (!fileList.length) {
    return '';
  }
  const item = fileList[0];
  if (item.status && item.status !== 0) {
    return '';
  }
  return item.tempFileURL || '';
}

async function getTempUrlMap(fileIds) {
  const map = new Map();
  if (!fileIds.length) {
    return map;
  }

  const res = await cloud.getTempFileURL({
    fileList: fileIds
  });

  const fileList = res.fileList || [];
  fileList.forEach((item) => {
    if (!item || !item.fileID) {
      return;
    }
    if (item.status && item.status !== 0) {
      return;
    }
    map.set(item.fileID, item.tempFileURL || '');
  });

  return map;
}

function toTimestamp(value) {
  if (!value) {
    return Date.now();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  return Date.now();
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  const hh = padZero(date.getHours());
  const mm = padZero(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}
