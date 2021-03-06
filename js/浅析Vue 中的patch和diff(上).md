## 疑问

1.当我修改了属性值时，vdom立即进行diff,重新渲染视图了吗？

2.如果1是对的，那重复修改，性能岂不是很差？如果不是，1是如何实现的？

3.我们的nextTick 具体的实现是怎样的？什么时候需要用到它？

4.vdom diff的过程是怎样的？

## 梗概

关于vue数据更新渲染的几个知识点，先列一下：

* 数据的更新是实时的，但是渲染是异步的。

* 一旦数据变化，会把在同一个事件循环event loop中的观察到的watcher 推入一个队列（相同watcher实例不会重复推入）

* DOM并不是马上更新视图的（想想也不可能，改动一次数据更新一次视图，肯定都是批量操作DOM的），vue 中的nextTick 用到了MicroTask和MacroTask，这需要我们去了解event loop（推荐先阅读下：[Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)
  ）

* 整个script是一个主任务, setTimeout 是一个macroTask, promise的回调是microtask, 顺序是

  主script（第一个主任务） —> microTask （全部执行完）—> UI渲染 —> 下一个macroTask

  ```javascript
  // 先不看结果，想一下你的输出
  console.log('script start');

  setTimeout(function() {
    console.log('setTimeout');
  }, 0);

  Promise.resolve().then(function() {
    console.log('promise1');
  }).then(function() {
    console.log('promise2');
  });

  console.log('script end');
  // result: 
  /**
  * script start
  * script end
  * promise1
  * promise2
  * setTimeout
  */
  ```


* 所以dom diff 这个过程是在microtask中去处理的（也有的是强制走macrotask, 本例子走microtask）
* 哪些会走macrotask 哪些会走microtask，为啥要区分，会写在拓展那一小节

## 例子
接下来，所有的讲解都会围绕下面这个例子
```javascript
<!DOCTYPE html>
<html>
<head>
	<title></title>
    <style>
        .f-error {
            color: red;
        }
    </style>
</head>
<body>
    <div id="test">
    </div>
    <script type="text/javascript" src="./vue.js"></script>
    <script type="x-template" id="temp">
        <section>
            <div :class="{'f-error': a==2}">{{a+b}}</div>
        </section>
    </script>
    <script type="text/javascript">
        var data = {
            a: 1,
            b: 1
        }
        new Vue({
            el: '#test',
            template: temp,
            data: function() {
                return data;
            },
            mounted() {
                setTimeout(() => {
                    data.a = 2;
                    data.b = 3;
                    this.$nextTick(()=> {
                        console.log(document.querySelector('.f-error'));
                    })
                }, 500);
            }
        });
    </script>
</body>
</html>
```

## 入口

#### 当```vm._update(vm._render(), hydrating)```

经过上一次分享，我们知道通过```vm._render()```方法，我们会获得我们的vdom; 接下去我们进入_update方法；我们看下内部的细节。

```javascript
Vue.prototype._update = function (vnode, hydrating) {
    var vm = this;
    if (vm._isMounted) {
      callHook(vm, 'beforeUpdate');
    }
    ...
    // 初始时，我们是没有prevVnode的， 进入了patch方法
    if (!prevVnode) {
      // initial render
	  // 初始化渲染，我们看下细节	
      vm.$el = vm.__patch__(
        vm.$el, vnode, hydrating, false /* removeOnly */,
        vm.$options._parentElm,
        vm.$options._refElm
      );
      // no need for the ref nodes after initial patch
      // this prevents keeping a detached DOM tree in memory (#5851)
      vm.$options._parentElm = vm.$options._refElm = null;
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode);
    }
    activeInstance = prevActiveInstance;
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null;
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm;
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el;
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  };
```

#### 初始进入patch

```javascript
// 当我们初始进入patch时，会进入createElm 根据我们的vnode 创建节点
return function patch (oldVnode, vnode, hydrating, removeOnly, parentElm, refElm) {
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) { invokeDestroyHook(oldVnode); }
      return
    }
    var isInitialPatch = false;
    var insertedVnodeQueue = [];

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      isInitialPatch = true;
      createElm(vnode, insertedVnodeQueue, parentElm, refElm);
    } else {
        ...
    }
}
```

## 数据更新时

假设我们的数据是```{a:1, b:1}```更新为了```{a:2, b:3}```, 我们下面看下细节

* a值发生了变化, 进入它的setter ——> 进入 dep.notify() 依赖通知
*  dep.notify() ——> subs[i].update() subs存放的是watcher 实例，进入watcher的update()方法
* watcher.update() ——> 将当前watcher 推入一个队列， 并且将flushSchedulerQueue（冲洗队列）这个动作放入nextTick(一个microtask 中),且将flushSchedulerQueue塞入callback数组
* 继续往下走，b值发生变化，进入它的setter ——> 进入 dep.notify() 依赖通知
* dep.notify() ——> subs[i].update() subs存放的是watcher 实例，进入watcher的update()方法
* watcher.update() ——> 当前watcher已经放入队列，不再放入，继续往下
* 遇到$nextTick(我们的cb) ——> 我们的cb也塞入callback数组
* 主任务（script）全部走完 ——> 开始执行所有microtask
* 开始执行flushCallBacks  ——> flushSchedulerQueue(这里后面有watcher.run()， dom diff, 视图更新) ——> 我们的cb
* 结束
```javascript
/**
mouted() {
    setTimeout(() => {
                    data.a = 2;
                    data.b = 3;
                    this.$nextTick(()=> {
                        console.log(document.querySelector('.f-error'));
                    })
                }, 500);
}
**/

new Vue({
		el: '#test',
		template: temp,
		data: function() {
			return data;
		},
		methods: {
			test() {
				data.a = 2;
				data.b = 3;
			}
		}
	});

// 当我们data.a 的值改变时，会进入它的setter
set: function reactiveSetter (newVal) {
      var value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if ("development" !== 'production' && customSetter) {
        customSetter();
      }
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = !shallow && observe(newVal);
      // 当值更新时，dep会通知watcher
      dep.notify();
    }

Dep.prototype.notify = function notify () {
  // stabilize the subscriber list first
  var subs = this.subs.slice();
  // 我们知道subs里面存放着我们的watcher实例， 进入watcher的update方法	    
  for (var i = 0, l = subs.length; i < l; i++) {
    subs[i].update();
  }
};

Watcher.prototype.update = function update () {
  /* istanbul ignore else */
  if (this.lazy) {
    this.dirty = true;
  } else if (this.sync) {
    this.run();
  } else {
    // 一般情况下，没有其他配置会进入这里,将我们的watcher推入队列  
    queueWatcher(this);
  }
};

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
function queueWatcher (watcher) {
  var id = watcher.id;
  // 判断这个watcher是否已经放入过队列
  if (has[id] == null) {
    has[id] = true;
    if (!flushing) {
      queue.push(watcher);
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      var i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      waiting = true;
      // 走到了这里, cb 是flushSchedulerQueue
      nextTick(flushSchedulerQueue);
    }
  }
}

// 进入了nextTick 方法，这里涉及到EventLoop相关的内容，后面会简单说一下
function nextTick (cb, ctx) {
  var _resolve;
  // 将flushSchedulerQueue塞入cb
  callbacks.push(function () {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, 'nextTick');
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  if (!pending) {
    pending = true;
    // 注意这里，一般情况下使用microTask但某些情境下会强制使用macroTask  
    if (useMacroTask) {
      macroTimerFunc();
    } else {
     // 我们的例子会进入这里， microTimerFunc结果是什么呢？往下看
      microTimerFunc();
    }
  }
  // $flow-disable-line 
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(function (resolve) {
      _resolve = resolve;
    })
  }
}

// Determine MicroTask defer implementation.
/* istanbul ignore next, $flow-disable-line */
if(typeof Promise !== 'undefined' && isNative(Promise)) {
   var p = Promise.resolve();
    microTimerFunc = function() {
        // 重点注意这里是promise的cb, 是一个microTask, 是在主script执行完才会执行的
        p.then(flushCallbacks);
    } 
}
```

data.a执行完以后，开始走data.b, 流程都一样，只是当我们遇到watcher的update时有些区别

```javascript
queueWatcher(this);
function queueWatcher (watcher) {
  var id = watcher.id;
  // 判断这个watcher是否已经放入过队列, 当执行到data.b时已经放入过队列了， 所以不会继续往下走了(这个也很好理解)
  if (has[id] == null) {
    has[id] = true;
    if (!flushing) {
      queue.push(watcher);
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      var i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      waiting = true;
      // 走到了这里
      nextTick(flushSchedulerQueue);
    }
  }
}
```

然后进入```this.$nextTick```方法

```javascript
 Vue.prototype.$nextTick = function (fn) {
    return nextTick(fn, this)
  };

function nextTick (cb, ctx) {
  var _resolve;
  // 将我们的cb塞入callbacks	    
  callbacks.push(function () {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, 'nextTick');
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  // 因为上一次pending 已经置为true,所以此时不符合条件
  if (!pending) {
    pending = true;
    if (useMacroTask) {
      macroTimerFunc();
    } else {
      microTimerFunc();
    }
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(function (resolve) {
      _resolve = resolve;
    })
  }
}
```

接下去，就到了我们之前讲到的，主script执行完了开始执行microTask, 进入flushSchedulerQueue方法。（tips: 推荐阅读[Tasks, microtasks, queues and schedules]( https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)更好地了解EventLoop)

```javascript
//  p.then(flushCallbacks);
function flushCallbacks () {
  pending = false;
  var copies = callbacks.slice(0);
  callbacks.length = 0;
  for (var i = 0; i < copies.length; i++) {
    copies[i]();
  }
}
// 开始遍历callbacks 执行其中的cb
// 第一个cb 是 flushSchedulerQueue
// 第二个cb 是 我们的 console.log(document.querySelector('.f-error')); 

// 第一个cb里面，watcher.run 最终会进入vdom的diff, 下一篇具体讲细节
function flushSchedulerQueue () {
  flushing = true;
  var watcher, id;
   ...
  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    id = watcher.id;
    has[id] = null;
    watcher.run();
    // in dev build, check and stop circular updates.
    ...
  }

  // keep copies of post queues before resetting state
  var activatedQueue = activatedChildren.slice();
  var updatedQueue = queue.slice();
  resetSchedulerState();

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue);
  callUpdatedHooks(updatedQueue);

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush');
  }
}
// 然后执行了我们的cb, 此时视图已经更新
// <div class='f-error'>5</div>    
```

## 总结

这一篇blog主要是为了让大家清楚

* 1.当数据更新时会将watcher 推入一个队列
* 2.当多个数据更新时，更新完不会立即更新视图
* 3.视图更新发生在nextTick, 利用microTask 实现
* 4.vdom 如何进行diff的将放在下一篇

## 拓展

##### 思考1：不用nextTick

如果很好地理解了micoTask 与 macroTask之间的关系，那么也能很清楚的理解假设我们写成下面这样, 为什么不行了，自己试试喽！下一篇，会细致讲解vdom diff 的过程~

```javascript
mounted() {
                setTimeout(() => {
                    data.a = 2;
                    data.b = 3;
                    console.log(document.querySelector('.f-error'));
                }, 500);
            }
```

##### 思考2： 如果都用MicroTask有什么问题？

看下这个issue, [@click would trigger event other vnode @click event. #6566](https://github.com/vuejs/vue/issues/6566)

贴一下代码，**vue的版本是2.4.2**，在此版本下当你点击了‘expand is true’以后，expand click 和 off click都打印出来了，countA与countB都变成了1，文案还是expand is true

```javascript
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>JS Bin</title>
    <!--<script src="https://unpkg.com/vue@2.4.2/dist/vue.js"></script>-->
    <script src="./vue2.4.js"></script>
</head>
<body>
<div class="panel" id="app">
    <div class="header" v-if="expand">
        <i @click="expandClick">Expand is True</i>
    </div>
	<!-- 注意这里@click 绑定到了外层 -->
    <div class="expand" v-if="!expand" @click="offClick">
        <i>Expand is False</i>
    </div>
    <div>
        countA: {{countA}}
    </div>
    <div>
        countB: {{countB}}
    </div>
    <div>
        expand: {{expand}}
    </div>
    Please Click `Expand is Ture`.
</div>
</body>

<script>
    debugger;
    new Vue({
        el: '#app',
        data: {
            expand: true,
            countA: 0,
            countB: 0,
        },
        methods: {
            expandClick() {
                this.expand = false;
                this.countA++;
                console.log('expand click');
            },
            offClick() {
                this.expand = true;
                this.countB++;
                console.log('off click');
            }
        }
    })
</script>
</html>
```

![](https://haitao.nos.netease.com/825e41f1-3d92-48d2-8661-167c4034457d.jpeg)

尤大在这个issue下面给了回答，引一下:

![](https://haitao.nos.netease.com/80e01bdd-2e68-4223-ae18-7f38ed5faf59.png)

大致原因是：```<i>```标签的点击动作触发了第一次nextTick(microTask), 然后我们得到了新的vdom并进行了渲染；microTask先于冒泡这个task，在microTask生成新dom的过程中，外层div添加了listener; 渲染完成后，冒泡触发了新的listener，所以又进入了新的cb。所以在Vue2.5版本中你会看到event handler使用了macroTask进行包裹

```javascript
/** Vue.js v2.5.13 **/
function add$1 (
  event,
  handler,
  once$$1,
  capture,
  passive
) {
  // 看这里	      
  handler = withMacroTask(handler);
  if (once$$1) { handler = createOnceHandler(handler, event, capture); }
  target$1.addEventListener(
    event,
    handler,
    supportsPassive
      ? { capture: capture, passive: passive }
      : capture
  );
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a Task instead of a MicroTask.
 */
function withMacroTask (fn) {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true;
    var res = fn.apply(null, arguments);
    useMacroTask = false;
    return res
  })
}
```



## 参考资料

1.vue2.0 正确理解Vue.nextTick()的用途 http://www.cnblogs.com/minigrasshopper/p/7879545.html

2.从event loop规范探究javaScript异步及浏览器更新渲染时机 https://github.com/aooy/blog/issues/5

3.Promise的队列与setTimeout的队列有何关联？https://www.zhihu.com/question/36972010/answer/71338002

4.JavaScript 运行机制详解：再谈Event Loop http://www.ruanyifeng.com/blog/2014/10/event-loop.html

5.Vue源码详解之nextTick：MutationObserver只是浮云，microtask才是核心！https://github.com/Ma63d/vue-analysis/issues/6
https://chuckliu.me/#!/posts/58bd08a2b5187d2fb51c04f9

6.Tasks, microtasks, queues and schedules https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/

7.@click would trigger event other vnode @click event. #6566 https://github.com/vuejs/vue/issues/6566