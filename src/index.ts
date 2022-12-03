import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { controlConfig } from "./config/index";

import { initRender } from "./render";
import { initRender2D } from "./renderer2d";
import { initScene } from "./scene";
import { initCamera } from "./camera";
import { initLight } from "./light";
import { starBackground } from "./starBg";
import { earth3dObj } from "./earth/index";
import { cityWaveAnimate } from "./earth/cityPoint";
import { cloudAnimation } from "./earth/cloud";
import type { EarthConfigProps, City, FlyData } from "./types/index";
import { InitFlyLine } from "../src/tools/flyLine";
import { GlobalConfig } from "./config";

const TWEEN = require("@tweenjs/tween.js");

class Earth {
  speed: any;
  width: number;
  height: number;
  parentDom: HTMLElement;
  renderer: THREE.WebGLRenderer;
  renderer2d: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControl: OrbitControls;
  earth3dObj: THREE.Object3D;
  earthConfig: EarthConfigProps;
  waveMeshArr: THREE.Mesh[];
  //城市列表
  cityList?: Record<string, City>;
  //飞线数据
  flyLineData?: FlyData[];
  //飞线管理
  flyManager: InitFlyLine = null;
  clock: THREE.Clock;
  targetQuaternion: THREE.Quaternion;

  constructor(
    containerId: string,
    //地球飞线城市坐标点
    cityList?: Record<string, City>,
    //飞线数据
    flyLineData?: FlyData[],
    config: EarthConfigProps = {
      earthRadius: GlobalConfig.earthRadius,
      autoRotate: true,
      zoomChina: false,
      starBackground: false,
      orbitControlConfig: {
        enableZoom: false,
        enableRotate: false
      }
    }
  ) {
    this.clock = new THREE.Clock();
    this.speed = 2;
    this.targetQuaternion = new THREE.Quaternion();

    this.parentDom = document.getElementById(containerId);
    this.width = this.parentDom.offsetWidth;
    this.height = this.parentDom.offsetHeight;
    this.cityList = cityList;
    this.flyLineData = flyLineData;
    GlobalConfig.earthRadius = config.earthRadius ?? GlobalConfig.earthRadius;
    this.earthConfig = config;
    this.init();
    this.addEvent();
  }

  addEvent = () => {
    // 获取模型表面点的空间三维坐标
    const getPointRay = (event, scene, camera) => {
      const windowX = event.clientX; //鼠标单击位置横坐标
      const windowY = event.clientY; //鼠标单击位置纵坐标
      let res = { point: null, mesh: null, intersects: null };

      let x = (windowX / window.innerWidth) * 2 - 1; //标准设备横坐标
      let y = -(windowY / window.innerHeight) * 2 + 1; //标准设备纵坐标
      let standardVector = new THREE.Vector3(x, y, 0.5); //标准设备坐标
      //标准设备坐标转世界坐标
      let worldVector = standardVector.unproject(camera);
      let ray = worldVector.sub(camera.position).normalize();
      console.log('worldVector==', ray);
      //创建射线投射器对象
      //let raycaster = new THREE.Raycaster(camera.position, ray);
      //返回射线选中的对象
      // let intersects = raycaster.intersectObjects(scene.children, true);
      // console.log(intersects);
      // if (intersects.length > 0) {
      //   let point = intersects[0].point; //射线在模型表面拾取的点坐标
      //   let mesh = intersects[0].object;
      //   res = { point, mesh, intersects };
      // }

      // 通过摄像机和鼠标位置更新射线
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      // 计算物体和射线的焦点
      const intersects = raycaster.intersectObjects(scene.children);
      console.log('intersects==', intersects[0]);
      if (intersects.length > 0) {
        let point = intersects[0].point; //射线在模型表面拾取的点坐标
        let mesh = intersects[0].object;
        res = { point, mesh, intersects };
      }
      return res;
    }

    // eslint-disable-next-line no-alert
    const focusOn3DObject = (mesh, obj) => {
      if (mesh) {
        obj.useQuaternion = true;
        obj.quaternion = new THREE.Quaternion(obj.x, obj.y, obj.z, 1);

        var newQuaternion = new THREE.Quaternion();
        THREE.Quaternion.slerp(mesh.quaternion, obj.quaternion, newQuaternion, 0.07);
        this.targetQuaternion = newQuaternion;
        console.log('event=2==>', this.targetQuaternion);
        this.targetQuaternion.normalize();
        mesh.applyQuaternion(this.targetQuaternion);
        //this.camera.quaternion.normalize();
        //this.orbitControl.update();
      }
    }
    
    // eslint-disable-next-line no-alert
    const gotoRotation = (obj) => {
      var c = this.earth3dObj.rotation.y;
      var d = -obj.z * (Math.PI / 180) % (2 * Math.PI);
      var e = Math.PI / 2 * -1;
      this.earth3dObj.rotation.y = c % (2 * Math.PI);
      this.earth3dObj.rotation.x = obj.x * (Math.PI / 180) % Math.PI;
      this.earth3dObj.rotation.y = d + e;
    }

    const flip = (obj) => {
      var camDistance = this.camera.position.length();
      const cloneCamera = this.camera.clone();
      console.log('camDistance===',camDistance);
      cloneCamera.position.copy(obj).normalize().multiplyScalar(camDistance);
      //this.camera.position.copy(obj).normalize().multiplyScalar(camDistance);
      //this.camera.position.copy(cloneCamera.position);
      //this.orbitControl.update();

      new TWEEN.Tween(this.camera.position)
        .to({ x: cloneCamera.position.x, y: cloneCamera.position.y, z: cloneCamera.position.z }, 300)
        //.easing(TWEEN.Easing.Linear.None)
        .easing(TWEEN.Easing.Back.InOut)
        // eslint-disable-next-line no-alert
        .onUpdate((object: any) => {
          this.orbitControl.update();
        }).start();

    }

    // 点击模型还原对应视角
    const get3Dmode = (event) => {
      const point3d = getPointRay(event, this.scene, this.camera).point;
      console.log('event=1==>', point3d);
      flip(point3d);
      //gotoRotation(point3d)

      //const earth = this.scene.getObjectByName('earth');
      //focusOn3DObject(this.camera,point3d);

      //const rotationMatrix = new THREE.Matrix4();
      //rotationMatrix.lookAt( target.position, mesh.position, mesh.up );
      //target.position.copy(camera.position);

      // const quaternion = new THREE.Quaternion(point3d.x, point3d.y, point3d.z, 1);
      // this.camera.applyQuaternion(quaternion); // Apply Quaternion
      // this.camera.quaternion.normalize();  // Normalize Quaternion

      // const time = 5000;
      // // 克隆相机用户计算点击后相机聚焦的位置
      // const cloneCamera = this.camera.clone();
      // // this.camera.lookAt(point3d);
      // cloneCamera.lookAt(point3d);

      // new TWEEN.Tween(this.camera.position)
      //   .to({ x: cloneCamera.position.x, y: cloneCamera.position.y, z: cloneCamera.position.z+1 }, 1000)
      //   .easing(TWEEN.Easing.Back.Out).start();

      // new TWEEN.Tween(this.camera.rotation)
      //   .to({ x: cloneCamera.rotation.x, y: cloneCamera.rotation.y, z: cloneCamera.rotation.z+1 }, 1000)
      //   .easing(TWEEN.Easing.Back.Out).start();

      //this.camera.updateMatrixWorld()
    }
    document.addEventListener('dblclick', get3Dmode, false);
  }

  load = () => {
    this.animate();
    if (this.earthConfig.starBackground) {
      this.scene.add(starBackground());
    }
    let { object3D, waveMeshArr, flyManager } = earth3dObj(
      this.cityList,
      this.flyLineData
    );
    this.earth3dObj = object3D;
    this.waveMeshArr = waveMeshArr;
    this.flyManager = flyManager;
    this.scene.add(this.earth3dObj);
    if (this.earthConfig.autoRotate && this.earthConfig.zoomChina) {
      this.autoRotateEarth();
    }
  };

  /**
   * @description: 初始化 threeJS 环境
   * @param {*}
   * @return {*}
   */
  init() {
    this.renderer = initRender(this.width, this.height);
    this.renderer2d = initRender2D(this.width, this.height);

    this.parentDom.appendChild(this.renderer.domElement);
    this.parentDom.appendChild(this.renderer2d.domElement);

    this.scene = initScene();
    this.camera = initCamera(this.width, this.height);
    initLight(this.scene);

    const orbitControl = new OrbitControls(
      this.camera,
      this.renderer2d.domElement
    );
    orbitControl.minZoom = controlConfig.minZoom;
    orbitControl.maxZoom = controlConfig.maxZoom;
    orbitControl.minPolarAngle = controlConfig.minPolarAngle;
    orbitControl.maxPolarAngle = controlConfig.maxPolarAngle;
    orbitControl.enableRotate = this.earthConfig.orbitControlConfig.enableRotate;
    orbitControl.enableZoom = this.earthConfig.orbitControlConfig.enableZoom;

    orbitControl.update();
    this.orbitControl = orbitControl;
  }

  /**
   * @description: 地球自动旋转
   * @param {*}
   * @return {*}
   */
  autoRotateEarth() {
    const startRotateY = (3.15 * Math.PI) / 2;
    const startZoom = -18;
    const endRotateY = 3.3 * Math.PI;
    const endZoom = 4;

    var that = this;

    //旋转地球动画
    var rotateEarthStep = new TWEEN.Tween({
      rotateY: startRotateY,
      zoom: startZoom,
    })
      .to({ rotateY: endRotateY, zoom: endZoom }, 36000) //.to({rotateY: endRotateY, zoom: endZoom}, 10000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(function (object: any) {
        if (that.earth3dObj) {
          that.earth3dObj.rotation.set(0, object.rotateY, 0);
        }
        (that.orbitControl as any).zoom0 = object.zoom < 1 ? 1 : object.zoom;
        that.orbitControl.reset();
      });

    var rotateEarthStepBack = new TWEEN.Tween({
      rotateY: endRotateY,
      zoom: endZoom,
    })
      .to({ rotateY: 3.15 * Math.PI * 2, zoom: startZoom }, 36000) //.to({rotateY: endRotateY, zoom: endZoom}, 10000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(function (object: any) {
        if (that.earth3dObj) {
          that.earth3dObj.rotation.set(0, object.rotateY, 0);
        }
        (that.orbitControl as any).zoom0 = object.zoom < 1 ? 1 : object.zoom;
        that.orbitControl.reset();
      });

    rotateEarthStep.chain(rotateEarthStepBack);
    rotateEarthStepBack.chain(rotateEarthStep);

    rotateEarthStep.start();
  }

  /**
   * @description: 帧变化需要做的动画
   * @param {*}
   * @return {*}
   */

  animate = () => {
    if (this.waveMeshArr) {
      cityWaveAnimate(this.waveMeshArr);
      cloudAnimation();
    }

    requestAnimationFrame(this.animate);
    //只是自转，不需要缩放到中国
    if (this.earth3dObj) {
      if (this.earthConfig.autoRotate && !this.earthConfig.zoomChina) {
        //this.earth3dObj.rotation.y += 0.01;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.afterAnimate();

    if (this.earth3dObj?.quaternion) {
      //console.log('========<>',this.earth3dObj.quaternion,this.targetQuaternion )
    }

    // if (this.camera?.quaternion && !this.camera.quaternion.equals(this.targetQuaternion)) {
    //   const delta = this.clock.getDelta();
    //   const step = this.speed * delta;
    //   this.camera.quaternion.rotateTowards(this.targetQuaternion, step);
    // }
  };

  afterAnimate = () => {
    TWEEN.update();
    //飞线更新，这句话一定要有
    if (this.flyManager != null) {
      this.flyManager.animation();
    }
  };
}

export default Earth;
