import {useEffect,useRef,useState} from "react";
import type {PlacedCabinet} from "../../shared/placed-cabinet-draft";
import {buildCabinet3DBoxes} from "../../shared/furniture-preview-3d";
import {loadThree} from "../../../../pages/arch/render-studio/RenderStudioParametricWebgl";

/** Experimental WebGL preview: shares cabinet data but is not embedded in the BIM scene. */
export function FurnitureWebGLPreview({items,selectedId,onSelect}:{items:readonly PlacedCabinet[];selectedId?:string|null;onSelect?:(id:string)=>void}){
 const mount=useRef<HTMLDivElement>(null);
 const [error,setError]=useState("");
 const selectedRef=useRef(selectedId);
 const onSelectRef=useRef(onSelect);
 useEffect(()=>{selectedRef.current=selectedId;onSelectRef.current=onSelect;},[selectedId,onSelect]);
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
     mesh.userData.furnitureId=b.id;
     scene.add(mesh);meshes.push(mesh);
    }
    renderer=new T.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    camera.aspect=(host.clientWidth||400)/280;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth||400,280);
    host.appendChild(renderer.domElement);
    const raycaster=new T.Raycaster(),pointer=new T.Vector2();
    let angle=Math.PI/4,polar=Math.PI/5,distance=extent*2.2,dragging=false,lastX=0,lastY=0,moved=false;
    const render=()=>{camera.position.set(target.x+Math.cos(angle)*Math.cos(polar)*distance,target.y+Math.sin(polar)*distance,target.z+Math.sin(angle)*Math.cos(polar)*distance);camera.lookAt(target);renderer.render(scene,camera);};
    const down=(e:PointerEvent)=>{dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;angle-=dx*.008;polar=Math.max(.08,Math.min(1.45,polar+dy*.008));lastX=e.clientX;lastY=e.clientY;};
    const up=(e:PointerEvent)=>{dragging=false;if(moved)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshes)[0];if(hit?.object?.userData?.furnitureId)onSelectRef.current?.(hit.object.userData.furnitureId);};
    const wheel=(e:WheelEvent)=>{e.preventDefault();distance=Math.max(.5,Math.min(extent*8,distance*Math.exp(e.deltaY*.001)));};
    renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointermove",move);renderer.domElement.addEventListener("pointerup",up);renderer.domElement.addEventListener("wheel",wheel,{passive:false});
    const cleanupListeners=()=>{renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointermove",move);renderer.domElement.removeEventListener("pointerup",up);renderer.domElement.removeEventListener("wheel",wheel);};
    (host as any).__webglCleanup=cleanupListeners;
    function animate(){if(disposed)return;for(const mesh of meshes){mesh.material.color.setHex(mesh.userData.furnitureId===selectedRef.current?0x8b5cf6:0xbab0e6);}render();frame=requestAnimationFrame(animate);}
    animate();
   }catch(e){if(!disposed)setError(e instanceof Error?e.message:"Falha WebGL");}
  })();
  return ()=>{disposed=true;cancelAnimationFrame(frame);(host as any)?.__webglCleanup?.();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}renderer?.dispose();renderer?.domElement?.remove();};
 },[items]);
 return <section className="rounded-xl border p-3"><h4 className="font-semibold text-sm">Prévia WebGL — experimental</h4><p className="text-xs text-amber-700">Arraste para orbitar, use a roda para zoom e clique no móvel para selecioná-lo. Prévia experimental, fora da cena BIM principal.</p><div ref={mount} className="mt-2 min-h-[280px] overflow-hidden rounded bg-slate-50"/>{error&&<p role="alert" className="text-xs text-red-700">{error}</p>}</section>;
}
