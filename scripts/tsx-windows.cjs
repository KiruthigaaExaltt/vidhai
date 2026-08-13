// tsx uses os.userInfo() to name its temporary directory on Windows. Some
// managed Windows environments return ENOMEM for that call. Supplying the
// Unix-compatible function lets tsx use a stable numeric temp suffix instead.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  process.geteuid = () => 1000;
}
