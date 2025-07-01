// keep track of written files, so we can provide links from an index page
const fileList: string[] = []
export const pushToFileList = (file: string) => fileList.push(file)
export const getFileList = () => fileList.slice() // return a copy
