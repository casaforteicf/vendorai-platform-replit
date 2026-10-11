import {useEffect,useRef,useState} from "react";
import type {PlacedCabinet} from "../../shared/placed-cabinet-draft";
import {buildCabinet3DBoxes} from "../../shared/furniture-preview-3d";
import {loadThree} from "../../../../pages/arch/render-studio/RenderStudioParametricWebgl";

/** Experimental WebGL preview: shares cabinet data but is not embedded in the BIM scene. */
export function FurnitureWebGLPreview({items}:{items:readonly PlacedCabinet[]}){
 const mount=useRef<HTMLDivElement>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  let disposed=false,renderer:any,frame=0;
  let meshes:any[]=[];
  const host=mount.current;
  if(!host)return;
  (async()=>{
   try{
    await loadThree();
    if(disposed||!host)return;
    const T=(window as any).THREE;
    if(!T?.WebGLRenderer)throw Error("WebGL indisponível");
    const scene=new T.Scene();scene.background=new T.Color(0xf8fafc);
    const camera=new T.PerspectiveCamera(45,1,.01,500);
    const boxes=buildCabinet3DBoxes(items);
    const extent=Math.max(2,...boxes.map(b=>Math.max(b.xMm+b.widthMm,b.yMm+b.depthMm,b.heightMm)/1000));
    camera.position.set(extent*1.5,extent*1.2,extent*1.5);
    const target=new T.Vector3(extent/2,0,extent/2);camera.lookAt(target);
    scene.add(new T.AmbientLight(0xffffff,.85));
    const sun=new T.DirectionalLight(0xffffff,.7);sun.position.set(3,8,5);scene.add(sun);
    const ground=new T.GridHelper(Math.max(extent*2,4),20,0x94a3b8,0xe2e8f0);scene.add(ground);
    for(const b of boxes){
     const material=new T.MeshStandardMaterial({color:0xbab0e6,roughness:.8});
     const mesh=new T.Mesh(new T.BoxGeometry(b.widthMm/1000,b.heightMm/1000,b.depthMm/1000),material);
     mesh.position.set((b.xMm+b.widthMm/2)/1000,b.heightMm/2000,(b.yMm+b.depthMm/2)/1000);
     scene.add(mesh);meshes.push(mesh);
    }
    renderer=new T.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(host.clientWidth||400,280);
    host.appendChild(renderer.domElement);
    let angle=0;
    function animate(){if(disposed)return;angle+=.002;camera.position.set(target.x+Math.cos(angle)*extent*1.8,extent*1.2,target.z+Math.sin(angle)*extent*1.8);camera.lookAt(target);renderer.render(scene,camera);frame=requestAnimationFrame(animate);}
    animate();
   }catch(e){if(!disposed)setError(e instanceof Error?e.message:"Falha WebGL");}
  })();
  return ()=>{disposed=true;cancelAnimationFrame(frame);for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}renderer?.dispose();renderer?.domElement?.remove();};
 },[items]);
 return <section className="rounded-xl border p-3"><h4 className="font-semibold text-sm">Prévia WebGL — experimental</h4><p className="text-xs text-amber-700">Volumes paramétricos sincronizados com os móveis. Ainda não é a cena BIM principal.</p><div ref={mount} className="mt-2 min-h-[280px] overflow-hidden rounded bg-slate-50"/>{error&&<p role="alert" className="text-xs text-red-700">{error}</p>}</section>;
}
