import * as THREE from "three";

/** Both textures are true classic 64×64 Minecraft UV sheets, derived from the
 * two warrior illustrations supplied by the player. Kept separate from UNO. */
export type WarriorSkin = "red" | "blue";
export const warriorSkins: WarriorSkin[] = ["red", "blue"];
export const normalizeWarriorSkin = (value: unknown): WarriorSkin => value === "blue" ? "blue" : "red";

type Part = "head" | "torso" | "armRight" | "armLeft" | "legRight" | "legLeft";
type Face = "right" | "left" | "top" | "bottom" | "back" | "front";
type Rect = readonly [number, number, number, number];
const UV: Record<Part, Record<Face, Rect>> = {
  head: {
    top:[8,0,8,8],bottom:[16,0,8,8],left:[0,8,8,8],front:[8,8,8,8],right:[16,8,8,8],back:[24,8,8,8]
  },
  torso: {
    top:[20,16,8,4],bottom:[28,16,8,4],right:[16,20,4,12],front:[20,20,8,12],left:[28,20,4,12],back:[32,20,8,12]
  },
  armRight: {
    top:[44,16,4,4],bottom:[48,16,4,4],right:[40,20,4,12],front:[44,20,4,12],left:[48,20,4,12],back:[52,20,4,12]
  },
  armLeft: {
    top:[36,48,4,4],bottom:[40,48,4,4],right:[32,52,4,12],front:[36,52,4,12],left:[40,52,4,12],back:[44,52,4,12]
  },
  legRight: {
    top:[4,16,4,4],bottom:[8,16,4,4],right:[0,20,4,12],front:[4,20,4,12],left:[8,20,4,12],back:[12,20,4,12]
  },
  legLeft: {
    top:[20,48,4,4],bottom:[24,48,4,4],right:[16,52,4,12],front:[20,52,4,12],left:[24,52,4,12],back:[28,52,4,12]
  }
};

/** BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.
 * Crazy Battle characters face -Z, so front is on -Z. */
const FACE_ORDER: Face[] = ["right", "left", "top", "bottom", "back", "front"];
function makeUvCube(part: Part) {
  const geometry = new THREE.BoxGeometry(1,1,1);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  FACE_ORDER.forEach((face,index) => {
    const [x,y,w,h] = UV[part][face];
    const a=x/64,b=(x+w)/64,c=1-y/64,d=1-(y+h)/64,offset=index*4;
    uv.setXY(offset,a,c); uv.setXY(offset+1,b,c);
    uv.setXY(offset+2,a,d); uv.setXY(offset+3,b,d);
  });
  uv.needsUpdate = true;
  return geometry;
}
const color = (hex:string) => new THREE.MeshLambertMaterial({color:hex});
function cubePart(parent:THREE.Object3D,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
}

export interface WarriorRig {
  group: THREE.Group;
  skin: WarriorSkin;
  setSkin(skin: WarriorSkin): void;
  setEquipment(weapon: "sword" | "bow", blocking: boolean): void;
  animate(time:number,moving:boolean): void;
}
export interface ViewWeapons {
  sword: THREE.Group;
  shield: THREE.Group;
  bow: THREE.Group;
  setWeapon(weapon:"sword"|"bow",block:boolean):void;
  animate(time:number,attackElapsed:number,bowCharge:number,moving:boolean):void;
}
export function makeCrazyVisuals() {
  const loader=new THREE.TextureLoader();
  const textures = {
    red:loader.load("/crazy/skins/warrior-red.png"),
    blue:loader.load("/crazy/skins/warrior-blue.png")
  };
  for(const texture of Object.values(textures)){
    texture.magFilter=THREE.NearestFilter;
    texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;
    texture.colorSpace=THREE.SRGBColorSpace;
  }
  const skinMaterials={
    red:new THREE.MeshLambertMaterial({map:textures.red}),
    blue:new THREE.MeshLambertMaterial({map:textures.blue})
  };
  const geometries:Record<Part,THREE.BoxGeometry>={
    head:makeUvCube("head"),torso:makeUvCube("torso"),
    armRight:makeUvCube("armRight"),armLeft:makeUvCube("armLeft"),
    legRight:makeUvCube("legRight"),legLeft:makeUvCube("legLeft")
  };
  const detailGeo=new THREE.BoxGeometry(1,1,1);
  const steel=color("#ced9e2"),highlight=color("#f7fcff"),darkSteel=color("#566376"),gold=color("#f9af3d"),goldLight=color("#ffe0a0");
  const leather=color("#512c26"),wood=color("#79451f"),woodDark=color("#482518");
  const shieldRed=color("#aa242a"),shieldBlue=color("#20569c"),ember=color("#f96d22");
  const allMaterials=[...Object.values(skinMaterials),steel,highlight,darkSteel,gold,goldLight,leather,wood,woodDark,shieldRed,shieldBlue,ember];
  const part=(root:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>
    cubePart(root,detailGeo,material,x,y,z,w,h,d);

  function makeSword() {
    const group=new THREE.Group();
    // Tapered pixel sword with silver bevel, segmented glints and golden hilt.
    part(group,0,-.38,0,.11,.44,.12,leather);
    part(group,0,-.63,0,.23,.15,.21,gold);
    part(group,0,-.10,0,.58,.12,.24,gold);
    part(group,0,.16,0,.22,.50,.13,steel);
    part(group,0,.66,0,.19,.50,.12,steel);
    part(group,0,1.03,0,.13,.24,.12,highlight);
    part(group,-.055,.36,-.071,.045,.67,.019,highlight);
    part(group,.055,.60,.067,.035,.53,.019,darkSteel);
    part(group,0,-.1,-.14,.13,.13,.05,ember);
    return group;
  }
  function makeShield(skin:WarriorSkin) {
    const group=new THREE.Group();
    const panel=skin==="red"?shieldRed:shieldBlue;
    part(group,0,0,0,.85,1.07,.14,darkSteel);
    part(group,0,.0,-.08,.70,.88,.09,panel);
    // Gold rim, center boss, flame/sigil emblem
    part(group,-.42,0,-.11,.07,.93,.08,gold);
    part(group,.42,0,-.11,.07,.93,.08,gold);
    part(group,0,.5,-.11,.86,.08,.08,gold);
    part(group,0,-.5,-.11,.70,.08,.08,gold);
    part(group,0,.1,-.15,.20,.29,.09,goldLight);
    part(group,-.14,-.06,-.14,.16,.24,.08,ember);
    part(group,.14,-.06,-.14,.16,.24,.08,ember);
    part(group,0,-.24,-.15,.14,.22,.09,gold);
    return group;
  }
  function makeBow() {
    const group=new THREE.Group();
    // Golden angular recurve bow made from short voxel limbs.
    const parts:[number,number,number,number,number][]=[
      [0,-.15,.12,.36,-.30],[.11,.15,.12,.42,.22],
      [.22,.51,.13,.37,-.18],[.29,.80,.13,.30,.30],
      [0,-.15,.12,.36,.30],[-.11,-.46,.12,.42,-.22],
      [-.22,-.80,.13,.37,.18]
    ];
    for(const [x,y,w,h,tilt] of parts){
      const m=part(group,x,y,0,w,h,.13,y>.52||y<-.55?gold:wood);
      m.rotation.z=tilt;
    }
    part(group,0,0,0,.18,.36,.24,leather);
    const stringMaterial=new THREE.LineBasicMaterial({color:"#fff7e2"});
    const points=[new THREE.Vector3(.30,.98,0),new THREE.Vector3(0,0,-.10),new THREE.Vector3(-.30,-.98,0)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),stringMaterial));
    group.userData["stringMaterial"]=stringMaterial;
    const loadedArrow=new THREE.Group();
    part(loadedArrow,0,0,0,.065,.065,1.13,woodDark);
    part(loadedArrow,0,0,-.59,.13,.13,.18,steel);
    part(loadedArrow,.10,0,.48,.20,.055,.18,ember);
    part(loadedArrow,-.10,0,.48,.20,.055,.18,ember);
    loadedArrow.position.set(.12,-.02,-.19);loadedArrow.visible=false;
    group.add(loadedArrow);group.userData["loadedArrow"]=loadedArrow;
    return group;
  }

  function createWarrior(skin:WarriorSkin):WarriorRig {
    const group=new THREE.Group();
    const material=skinMaterials[skin];
    const head=cubePart(group,geometries.head,material,0,1.65,0,.68,.68,.68);
    cubePart(group,geometries.torso,material,0,1.07,0,.78,.76,.40);
    const leftArm=new THREE.Group(),rightArm=new THREE.Group();
    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
    leftArm.position.set(-.52,1.38,0);rightArm.position.set(.52,1.38,0);
    leftLeg.position.set(-.22,.73,0);rightLeg.position.set(.22,.73,0);
    cubePart(leftArm,geometries.armLeft,material,0,-.33,0,.30,.74,.39);
    cubePart(rightArm,geometries.armRight,material,0,-.33,0,.30,.74,.39);
    cubePart(leftLeg,geometries.legLeft,material,0,-.36,0,.33,.72,.39);
    cubePart(rightLeg,geometries.legRight,material,0,-.36,0,.33,.72,.39);
    group.add(leftArm,rightArm,leftLeg,rightLeg);
    const sword=makeSword(),shield=makeShield(skin),bow=makeBow();
    sword.position.set(.06,-.69,-.28);sword.scale.setScalar(.5);rightArm.add(sword);
    shield.position.set(-.10,-.38,-.30);shield.scale.setScalar(.60);leftArm.add(shield);
    bow.position.set(.06,-.53,-.24);bow.scale.setScalar(.42);rightArm.add(bow);
    return {
      group,skin,
      setSkin(next){if(this.skin===next)return;group.traverse(node=>{if(node instanceof THREE.Mesh&&(node.material===skinMaterials.red||node.material===skinMaterials.blue))node.material=skinMaterials[next];});this.skin=next;},
      setEquipment(weapon,blocking){sword.visible=weapon==="sword";shield.visible=weapon==="sword";bow.visible=weapon==="bow";shield.position.z=blocking?-.55:-.30;},
      animate(time,moving){const cycle=moving?Math.sin(time*.011)*.58:Math.sin(time*.002)*.018;
        leftLeg.rotation.x=cycle;rightLeg.rotation.x=-cycle;
        leftArm.rotation.x=-cycle*.55;rightArm.rotation.x=cycle*.55;
        head.rotation.y=Math.sin(time*.0009)*.028;
      }
    };
  }

  function createViewWeapons(camera:THREE.Camera,skin:WarriorSkin):ViewWeapons {
    const sword=makeSword(),shield=makeShield(skin),bow=makeBow();
    sword.position.set(.68,-.67,-1.15);sword.rotation.set(.11,0,-.13);sword.scale.setScalar(.66);
    shield.position.set(-.77,-.64,-1.10);shield.rotation.y=-.15;shield.scale.setScalar(.72);
    bow.position.set(.73,-.45,-1.14);bow.rotation.z=.16;bow.scale.setScalar(.62);
    camera.add(sword,shield,bow);
    return {
      sword,shield,bow,
      setWeapon(weapon,block){sword.visible=shield.visible=weapon==="sword";bow.visible=weapon==="bow";shield.position.y=block?-.25:-.64;},
      animate(time,attackElapsed,bowCharge,moving){
        const bob=moving?Math.sin(time*.011)*.038:Math.sin(time*.002)*.008;
        sword.position.y=-.67+bob;sword.rotation.z=-.13+(attackElapsed<250?Math.sin(attackElapsed/250*Math.PI)*-.95:0);
        shield.rotation.x=Math.sin(time*.002)*.02;
        bow.position.y=-.45+bob;bow.position.z=-1.14+bowCharge*.18;
        (bow.userData["loadedArrow"] as THREE.Group).visible=bowCharge>0;
      }
    };
  }
  return {createWarrior,createViewWeapons,dispose(){
    for(const geometry of Object.values(geometries))geometry.dispose();
    detailGeo.dispose();for(const texture of Object.values(textures))texture.dispose();
    for(const mat of allMaterials)mat.dispose();
  }};
}
