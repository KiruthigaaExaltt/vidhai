import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { registerSW } from "virtual:pwa-register";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
type PwaState = { online:boolean; standalone:boolean; updateAvailable:boolean; updating:boolean; installAvailable:boolean; iosInstallAvailable:boolean; checkForUpdates():Promise<void>; applyUpdate():Promise<void>; install():Promise<void>; repair():Promise<void> };
const Context=createContext<PwaState|null>(null);
const standaloneNow=()=>matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
const iosSafari=()=>((/iPad|iPhone|iPod/.test(navigator.userAgent))||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

export function PwaProvider({children}:{children:ReactNode}) {
  const [online,setOnline]=useState(navigator.onLine), [standalone,setStandalone]=useState(standaloneNow());
  const [updateAvailable,setUpdateAvailable]=useState(false), [updating,setUpdating]=useState(false);
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null), [showIos,setShowIos]=useState(false);
  const registration=useRef<ServiceWorkerRegistration|null>(null), reloaded=useRef(false);
  const updateSW=useRef<(reloadPage?:boolean)=>Promise<void>>(()=>Promise.resolve());
  const inspect=useCallback((reg?:ServiceWorkerRegistration|null)=>{if(reg?.waiting)setUpdateAvailable(true)},[]);
  const checkForUpdates=useCallback(async()=>{if(registration.current){await registration.current.update();inspect(registration.current)}},[inspect]);
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    updateSW.current=registerSW({immediate:true,onNeedRefresh:()=>setUpdateAvailable(true),onRegisteredSW(_url,reg){registration.current=reg||null;inspect(reg);void reg?.update();reg?.addEventListener("updatefound",()=>{const worker=reg.installing;worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setUpdateAvailable(true)})})},onRegisterError:error=>console.error("PWA registration failed",error)});
    const changed=()=>{if(!reloaded.current){reloaded.current=true;location.reload()}};navigator.serviceWorker.addEventListener("controllerchange",changed);return()=>navigator.serviceWorker.removeEventListener("controllerchange",changed);
  },[inspect]);
  useEffect(()=>{const before=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPromptEvent)},installed=()=>{setPrompt(null);setStandalone(true);setShowIos(false)},on=()=>setOnline(true),off=()=>setOnline(false),display=()=>setStandalone(standaloneNow()),media=matchMedia("(display-mode: standalone)");addEventListener("beforeinstallprompt",before);addEventListener("appinstalled",installed);addEventListener("online",on);addEventListener("offline",off);media.addEventListener("change",display);return()=>{removeEventListener("beforeinstallprompt",before);removeEventListener("appinstalled",installed);removeEventListener("online",on);removeEventListener("offline",off);media.removeEventListener("change",display)}},[]);
  useEffect(()=>{const check=()=>{if(document.visibilityState==="visible")void checkForUpdates()};addEventListener("focus",check);addEventListener("pageshow",check);document.addEventListener("visibilitychange",check);const timer=setInterval(check,300000);return()=>{removeEventListener("focus",check);removeEventListener("pageshow",check);document.removeEventListener("visibilitychange",check);clearInterval(timer)}},[checkForUpdates]);
  const applyUpdate=useCallback(async()=>{if(updating)return;setUpdating(true);registration.current?.waiting?.postMessage({type:"SKIP_WAITING"});await updateSW.current(false)},[updating]);
  const install=useCallback(async()=>{if(prompt){await prompt.prompt();await prompt.userChoice;setPrompt(null)}else if(iosSafari()&&!standalone)setShowIos(true)},[prompt,standalone]);
  const repair=useCallback(async()=>{await (await navigator.serviceWorker.getRegistration())?.unregister();for(const name of await caches.keys())if(name.startsWith("vidhai-")||name.startsWith("workbox-precache"))await caches.delete(name);location.reload()},[]);
  const value=useMemo(()=>({online,standalone,updateAvailable,updating,installAvailable:!!prompt&&!standalone,iosInstallAvailable:iosSafari()&&!standalone,checkForUpdates,applyUpdate,install,repair}),[online,standalone,updateAvailable,updating,prompt,checkForUpdates,applyUpdate,install,repair]);
  const initialOffline = !online && !("serviceWorker" in navigator && navigator.serviceWorker.controller);
  return <Context.Provider value={value}>{initialOffline ? <div className="min-h-[100dvh] grid place-items-center bg-background p-6 text-center"><div><h1 className="text-xl font-semibold">Connection required</h1><p className="mt-2 text-sm text-muted-foreground">Vidhai ERP needs one successful online load before its application shell is available offline.</p><button className="mt-4 rounded bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={()=>location.reload()}>Retry</button></div></div> : children}<Status state={value} showIos={showIos} closeIos={()=>setShowIos(false)} later={()=>setUpdateAvailable(false)}/></Context.Provider>;
}
export const usePwa=()=>{const state=useContext(Context);if(!state)throw new Error("usePwa must be used inside PwaProvider");return state};
function Status({state,showIos,closeIos,later}:{state:PwaState;showIos:boolean;closeIos():void;later():void}){
  const box="fixed z-[100] right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] max-w-sm rounded-md border bg-background p-4 shadow-xl";
  if(state.updateAvailable)return <div role="status" className={box}><p className="text-sm font-medium">A new Vidhai ERP version is ready.</p><div className="mt-3 flex gap-2"><button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={state.updating} onClick={()=>void state.applyUpdate()}>{state.updating?"Updating…":"Update App"}</button><button className="rounded border px-3 py-2 text-sm" onClick={later}>Later</button></div></div>;
  if(!state.online)return <div role="status" aria-live="polite" className={box}><p className="text-sm">You’re offline. Cached screens remain available; live business data requires a connection.</p><button className="mt-2 text-sm underline" onClick={()=>location.reload()}>Retry</button> · <button className="text-sm underline" onClick={()=>void state.repair()}>Repair application</button></div>;
  if(showIos)return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"><div className="max-w-sm rounded-md bg-background p-5 shadow-xl"><h2 className="font-semibold">Install Vidhai ERP</h2><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>Open this application in Safari.</li><li>Tap Share.</li><li>Select Add to Home Screen.</li><li>Tap Add.</li></ol><button className="mt-4 rounded border px-3 py-2 text-sm" onClick={closeIos}>Close</button></div></div>;
  if(state.installAvailable||state.iosInstallAvailable)return <button className="fixed z-[90] right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg" onClick={()=>void state.install()}>Install App</button>;
  return null;
}
