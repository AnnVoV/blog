/**
 * 绑定事件相关方法
 */
var _on = function (el, event, cb) {
    el.addEventListener(event, cb)
}
/**
 * el 是否匹配selector 选择规则
 * @param el
 * @param selector
 * @returns {*}
 * @private
 */
var _matches = function (el, selector) {
    if (el.matches(selector)) {
        return el
    }
    return null
}
/**
 * 查找离el的target是selector的最近的元素
 * @param el
 * @param selector
 * @private
 */
var _closest = function (el, selector) {
    while (el.parentNode !== document) {
        if (_matches(el, selector)) {
            return el
        }
        el = el.parentNode
    }
}

var _index = function(targetNode, selector) {
    var cur = 0;
    while(targetNode && (targetNode = targetNode.previousElementSibling)) {
        if (_matches(targetNode, selector)) cur++;
    }
    return cur;
}

export default class ST {
    constructor (el, options = {}) {
        this.el = el
        this.options = options
        this.init()
    }

    init () {
        this.bind()
    }

    bind () {
        _on(this.el, 'dragstart', this._dragStart.bind(this))
        _on(this.el, 'dragover', this._dragOver.bind(this))
    }

    _dragStart (e) {
        this.dragTarget = _closest(e.target, this.options.selector || '*')
        this.startIndex = e.startIndex = _index(this.dragTarget, this.options.selector);
        if (typeof this.options.onStart === 'function') {
            this.options.onStart.call(this, e)
        }
    }

    _dragOver (e) {
        var toNode = _closest(e.target, this.options.selector || '*')
        // 用于判断是插入前面还是插入在后面
        var after = (toNode.nextElementSibling !== this.dragTarget)
        if (toNode !== this.dragTarget) {
            // 为什么不会重复进入这个方法 因为移动后dragOver的target变化了
            toNode.parentNode.insertBefore(this.dragTarget, (after) ? toNode.nextElementSibling : toNode)
            if (typeof this.options.onMove === 'function') {
                e.endIndex = this.endIndex = _index(this.dragTarget, this.options.selector);
                e.startIndex = this.startIndex;
                this.options.onMove.call(this, e)
            }
        }
    }
}
