// Sound files bundled with the app (Metro turns each import into an asset id).
declare module '*.mp3' {
  const asset: number;
  export default asset;
}
