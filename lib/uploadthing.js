const { UTApi } = require("uploadthing/server");

let _utapi = null;

function getUTApi() {
  if (!_utapi) {
    _utapi = new UTApi({
      apiKey: process.env.UPLOADTHING_SECRET,
    });
  }
  return _utapi;
}

async function uploadFile(buffer, filename, mimeType) {
  const utapi = getUTApi();
  const file = new File([buffer], filename, { type: mimeType });
  const res = await utapi.uploadFiles(file);
  if (res.error) throw new Error(res.error.message);
  return {
    key: res.data.key,
    url: res.data.url,
    name: res.data.name,
  };
}

async function deleteFile(key) {
  const utapi = getUTApi();
  await utapi.deleteFiles(key);
}

module.exports = { uploadFile, deleteFile };