## Regular 源码学习

### 1.获取template 字符串 ---> ast 语法树
（template 先分词 得到token 然后语法解析生成ast 抽象语法树， 利用parse 与字符串模板本质不同的地方在于利用parse使我们的字符串模板变得有逻辑）

### 2. compile过程，得到对应dom, 生成group对象
得到语法树ast以后进入compile 阶段，compile 阶段主要做了什么呢？ 我们会遍历我们的ast语法树通过_walk方法，根据ast节点的不同类型，执行对应的方法```walkers[ast.type]()```
* ast的节点type有3种， text、expressoin、element; 
* 当遇到type='expression'的节点时，我们必然需要让表达式与data之间产生关联？如何做到的呢？通过watcher。那么watcher是如何创建的呢？我们继续往下看。

```javascript
walkers.expression = function(ast, options){
	  var cursor = options.cursor, node,
	    mountNode = cursor && cursor.node;

	  if(mountNode){
	    //@BUG: if server render &gt; in Expression will cause error
	    var astText = _.toText( this.$get(ast) );
	    node = walkers._handleMountText(cursor, astText);

	  }else{
	    node = document.createTextNode("");
	  }
	  // 如果是表达式类型，会进入这个$watch 方法, 第二个参数是cb, 接下来看下$watch方法
	  this.$watch(ast, function(newval){
	    dom.text(node, _.toText(newval));
	  }, OPTIONS.STABLE_INIT )
	  return node;

	}
``` 
* $watch 里面做了什么呢？会执行touchExpression方法， touchExpression 会将ast中的exprBody转换为Function; 然后生成了一个watcher对象，watcher对象上会存有expr.get 和 expr.set 方法。

* 然后进入digest阶段，进入checkSingleWatch方法，checkSingleWatch 主要执行了 ```now = watcher.get(this); // 很简单就是取data是对应表达式的值
      last = watcher.last; ```如果now 与 last 计算得到的值并不相等标记dirty=true
* 注意一个细节，在type='expression'的方法里面，$watch有一个cb, 当我们得到了newVal = now后，会进入这个cb, 即把data 与expression相结合，计算得到的结果转换为了一个textNode 
```javascript
this.$watch(ast, function(newval){
	    dom.text(node, _.toText(newval));
	  }, OPTIONS.STABLE_INIT )
```

* 最终每一次得到的真实dom 都会放入```new Group(res)```中，最终我们得到了group对象

```javascript
$watch = function() {
  ...
  if(typeof expr === 'function'){
    get = expr.bind(this);      
  }else{
    // 重点看这里
    expr = this.$expression(expr);
    get = expr.get;
    once = expr.once;
  }
  var watcher = {
	      id: uid, 
	      get: get, 
	      fn: fn, 
	      once: once, 
	      force: options.force,
	      // don't use ld to resolve array diff
	      diff: options.diff,
	      test: test,
	      deep: options.deep,
	      last: options.sync? get(this): options.last
 }
 // 并将它存储于_watchers 属性中
 this[options.stable? '_watchersForStable': '_watchers'].push(watcher);
 ...
 // 然后进入init 阶段
 // init state.
	    if(options.init === true){
	      var prephase = this.$phase;
	      // 初始开始一次脏检查
	      this.$phase = 'digest';
	      // 进入checkSingleWatch 方法
	      this._checkSingleWatch( watcher);
	      this.$phase = prephase;
	    }
	    return watcher;
}
```
```javascript
 _touchExpr: function(expr, ext){
	    var rawget, ext = this.__ext__, touched = {};
	    if(expr.type !== 'expression' || expr.touched) return expr;

	    rawget = expr.get;
	    if(!rawget){
	      rawget = expr.get = new Function(_.ctxName, _.extName , _.prefix+ "return (" + expr.body + ")");
	      expr.body = null;
	    }
	    touched.get = !ext? rawget: function(context, e){
	      return rawget( context, e || ext )
	    }

	    if(expr.setbody && !expr.set){
	      var setbody = expr.setbody;
	      var filters = expr.filters;
	      var self = this;
	      if(!filters || !_.some(filters, function(filter){ return !self._f_(filter).set }) ){
	        expr.set = function(ctx, value, ext){
	          expr.set = new Function(_.ctxName, _.setName , _.extName, _.prefix + setbody);          
	          return expr.set(ctx, value, ext);
	        }
	      }
	      expr.filters = expr.setbody = null;
	    }
	    if(expr.set){
	      touched.set = !ext? expr.set : function(ctx, value){
	        return expr.set(ctx, value, ext);
	      }
	    }

	    touched.type = 'expression';
	    touched.touched = true;
	    touched.once = expr.once || expr.constant;
	    return touched
	  },
```
![](https://haitao.nos.netease.com/a223cea5-4da2-4ea4-9fc5-608e9a516429.png)
![](https://haitao.nos.netease.com/3e9cb5d7-335e-4c5a-a1a4-c94834b45921.png)

```
_checkSingleWatch: function(watcher){
	    var dirty = false;
	    if(!watcher) return;

	    var now, last, tlast, tnow,  eq, diff;

	    if(!watcher.test){
       // 进入expr.get 方法 执行function 的值，表达式里有个_sg_方法，我们看下具体指的是什么
	      now = watcher.get(this);
	      last = watcher.last;

	      if(now !== last || watcher.force){
	        tlast = _.typeOf(last);
	        tnow = _.typeOf(now);
	        eq = true; 

	        // !Object
	        if( !(tnow === 'object' && tlast==='object' && watcher.deep) ){
	          // Array
	          if( tnow === 'array' && ( tlast=='undefined' || tlast === 'array') ){
	            diff = diffArray(now, watcher.last || [], watcher.diff)
	            if( tlast !== 'array' || diff === true || diff.length ) dirty = true;
	          }else{
	            eq = _.equals( now, last );
	            if( !eq || watcher.force ){
	              watcher.force = null;
	              dirty = true; 
	            }
	          }
	        }else{
	          diff =  diffObject( now, last, watcher.diff );
	          if( diff === true || diff.length ) dirty = true;
	        }
	      }

	    } else{
	      // @TODO 是否把多重改掉
	      var result = watcher.test(this);
	      if(result){
	        dirty = true;
	        watcher.fn.apply(this, result)
	      }
	    }
	    if(dirty && !watcher.test){
	      if(tnow === 'object' && watcher.deep || tnow === 'array'){
	        watcher.last = _.clone(now);
	      }else{
	        watcher.last = now;
	      }
	      //  这里会执行通过$watch 传入的cb, 本质就是把刚刚模板与数值结合得到的值转换为textNode
	      watcher.fn.call(this, now, last, diff)
	      if(watcher.once) this.$unwatch(watcher)
	    }

	    return dirty;
	  },
```


### 3.inject 阶段
进入inject 方法，将得到的dom插入到我们的页面上

```javascript
inject: function(node, pos ){
	    var group = this;
	    var fragment = combine.node(group.group || group);
	    if(node === false) {
	      animate.remove(fragment)
	      return group;
	    }else{
	      if(!fragment) return group;
	      if(typeof node === 'string') node = dom.find(node);
	      if(!node) throw Error('injected node is not found');
	      // use animate to animate firstchildren
	      animate.inject(fragment, node, pos);
	    }
	    // if it is a component
	    if(group.$emit) {
	      var preParent = group.parentNode;
	      var newParent = (pos ==='after' || pos === 'before')? node.parentNode : node;
	      group.parentNode = newParent;
	      group.$emit("$inject", node, pos, preParent);
	    }
	    return group;
	  },
```
### 4.数据更新 $update
当数据更新时，我们手动调用```$update()```方法进入```$digest```，遍历我们直接存储的watcher,每一个watcher会再次进入checkSingleWatch方法，再次计算此时的now与上一次的last值作对比，同样当发现last与now值不同时，触发callback，我们重点看下这个cb(上面有说过，再看下)
```javascript
walkers.expression = function(ast, options){
	  var cursor = options.cursor, node,
	    mountNode = cursor && cursor.node;

	  if(mountNode){
	    //@BUG: if server render &gt; in Expression will cause error
	    var astText = _.toText( this.$get(ast) );
	    node = walkers._handleMountText(cursor, astText);

	  }else{
	    node = document.createTextNode("");
	  }
	  // cb 就是后面的这个function, 主要做的事情就是把node的textProp改为了当前的newVal值，注意这里的cb是个闭包，所以当我们值更新的时候，可以直接拿到这个node, 对node进行修改
	  this.$watch(ast, function(newval){
	    dom.text(node, _.toText(newval));
	  }, OPTIONS.STABLE_INIT )
	  return node;

	}
```

###  关于$compile 的内部细节

1.调用$watch 方法，根据我们ast得到的expression, 生成一个expr.get 方法和expr.set 方法（其实和vue的render function 生成很相似，就是把模板转换为一个function, 只是少了依赖收集的这个过程，regular是脏检查，查不到依赖关系）

```javascript
rawget = expr.get = new Function(_.ctxName, _.extName , _.prefix+ "return (" + expr.body + ")
```
* expr.get:

  ![](https://haitao.nos.netease.com/68983565-6967-4e84-999b-3e60e8dc3ea0.jpeg)

* expr.set:
  ![](https://haitao.nos.netease.com/611fa64d-1d91-4c4b-8f8b-4549746b4823.jpeg)

2.然后生成一个新的watcher 对象,并且属性上有get,set等方法（就是上面的expr.get 和 expr.set); 然后将它push到我们的this._watches 观察者队列中

```javascript
// 看下watcher结构
var watcher = {
  id: uid, 
  get: get, 
  fn: fn, 
  once: once, 
  force: options.force,
  // don't use ld to resolve array diff
  diff: options.diff,
  test: test,
  deep: options.deep,
  last: options.sync? get(this): options.last
}
```
3.然后开始digest 进入脏检查阶段从根节点root开始递归， 进入checkSingleWatch方法（避免重复检测）。重点的地方在 now = watcher.get(this)这里， 也就是开始执行我们上面得到的expr.get 方法。expr.get 执行完就得到了now,再与last进行对比，看下面的例子：

```javascript
//expr.get 例子： 比如我们{{a}} 的到的get 方法是下面这个，我们的data.a = 1 然后我们看下_sg_
return c._sg_('a', d, e)

// simple accessor get
// path 就是我们此时的key defaults 是我们的data 我们例子里的<div>{a}</div> 最终会执行到return deaults[path]
	  _sg_:function(path, defaults, ext){
	    if( path === undefined ) return undefined;
	    if(ext && typeof ext === 'object'){
	      if(ext[path] !== undefined)  return ext[path];
	    }
	    var computed = this.computed,
	      computedProperty = computed[path];
	    if(computedProperty){
	      if(computedProperty.type==='expression' && !computedProperty.get) this._touchExpr(computedProperty);
	      if(computedProperty.get)  return computedProperty.get(this);
	      else _.log("the computed '" + path + "' don't define the get function,  get data."+path + " altnately", "warn")
	    }

	    if( defaults === undefined  ){
	      return undefined;
	    }
        // 大部分简单情况我们返回了data[key]
	    return defaults[path];
	  }
```

```javascript
_checkSingleWatch: function(watcher){
	    var dirty = false;
	    if(!watcher) return;

	    var now, last, tlast, tnow,  eq, diff;

	    if(!watcher.test){
		 // 获取get计算得到的当前值	
	      now = watcher.get(this);
        // 初始时，上一次没有值 undefined   
	      last = watcher.last;

	      if(now !== last || watcher.force){
	        tlast = _.typeOf(last);
	        tnow = _.typeOf(now);
	        eq = true; 

	        // !Object
	        if( !(tnow === 'object' && tlast==='object' && watcher.deep) ){
	          // Array
	          if( tnow === 'array' && ( tlast=='undefined' || tlast === 'array') ){
	            diff = diffArray(now, watcher.last || [], watcher.diff)
	            if( tlast !== 'array' || diff === true || diff.length ) dirty = true;
	          }else{
				// now 与 last 并不相等，进入这里                  
	            eq = _.equals( now, last );
	            if( !eq || watcher.force ){
	              watcher.force = null;
	              dirty = true; 
	            }
	          }
	        }else{
	          diff =  diffObject( now, last, watcher.diff );
	          if( diff === true || diff.length ) dirty = true;
	        }
	      }

	    } else{
	      // @TODO 是否把多重改掉
	      var result = watcher.test(this);
	      if(result){
	        dirty = true;
	        watcher.fn.apply(this, result)
	      }
	    }
	    if(dirty && !watcher.test){
	      if(tnow === 'object' && watcher.deep || tnow === 'array'){
	        watcher.last = _.clone(now);
	      }else{
	        watcher.last = now;
	      }
	 	  // 这里进入前面$watch 传入的cb 我在后面贴一下	(贴1)           
	      watcher.fn.call(this, now, last, diff)
	      if(watcher.once) this.$unwatch(watcher)
	    }

	    return dirty;
	  }
// -------  贴在了这里  ------- 
// 贴1： cb 贴在了这里 就是把expression 通过get计算出来得到的值，转换为了一个textNode节点
this.$watch(ast, function(newval){
	    dom.text(node, _.toText(newval));
	  }, OPTIONS.STABLE_INIT )

// dom.text 方法
dom.text = (function (){
	  var map = {};
	  if (dom.msie && dom.msie < 9) {
	    map[1] = 'innerText';    
	    map[3] = 'nodeValue';    
	  } else {
	    map[1] = map[3] = 'textContent';
	  }
	  
	  return function (node, value) {
	    var textProp = map[node.nodeType];
	    if (value == null) {
	      return textProp ? node[textProp] : '';
	    }
	    node[textProp] = value;
        // 得到了一个描述这个node相关的对象可以看做一个VDom  
	  }
	})();
```

## 题外话： 为什么使用脏检查(作者说)

1. 脏检查完全不关心你改变数据的方式，而常规的set, get的方式则会强加许多限制（vs Vue）
2. 脏检查可以实现批处理完数据之后，再去统一更新view.(Vue2 也可以, 它利用了microtask mutaionObserve, 或者Promise)
3. 脏检查其实比 GET/SET 更容易实现。脏检查是个单向的检查流程(请不要和双向绑定发生混淆)，可以实现*_任意复杂度的表达式支持*。而get/set的方式则需要处理复杂依赖链，基本上表达式支持都是阉割的(使用时就像踩雷).

但是很显然，脏检查是低效的，它的效率基本上取决于你绑定的观察者数量，在Regular中，你可以通过[`@(Expression)`](https://regularjs.github.io/reference?syntax-zh#bind-once)元素来控制你的观察者数量。

然而结合这种类mvvm系统中，他又是高效的。因为监听模式带来了dom的局部更新，而dom操作恰恰又是隐藏的性能瓶颈所在。

> Regular实际上在解析时，已经提取了表达式的依赖关系，在未来Observe到来时，可以调整为脏检查 + 依赖计算的方式（如：vue2）

### 与Vue2的一些对比
1.Regular 使用的是脏检查，而Vue2利用模板解析与getter,setter 结合使用了依赖收集
2.虽然作者说脏检查可以批处理数据之后再更新视图，但是我看到的当数据发生变化时，视图更新并不是批量的？（初始的第一次是批量的，这里我再看下）；Vue2里使用watcher队列对dom的更新进行了批处理，当数据统一处理完后，再利用microtask 渲染视图。

参考文档：
https://note.youdao.com/share/?id=f00a086b157b0c13b9c5ea98f180b799&type=note#/
http://www.html-js.com/article/Regularjs-Chinese-guidelines-for-a-comprehensive-summary-of-the-front-template-technology