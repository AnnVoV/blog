<script>
    /**
     * 使用demo
     * <my-drag @start="testStart" :options="myOpt" v-model="myList">
     *  <ul class="m-ul">
     *      <li v-for="item in myList" draggable="true" :key="item">{{item}}</li>
     *  </ul>
     * </my-drag>
     */
    import ST from './mySort.js'
    // ST 里面提供的钩子
    var eventsListened = ['Start', 'Move']
    export default {
        name: 'my-draggable',
        props: {
            options: Object,
            value: Array
        },
        render (h) {
            var slot = this.$slots.default
            this.element = slot[0].tag.toLowerCase()
            return h(this.element || 'div', {}, slot[0].children)
        },
        mounted () {
            var newOpt = {}
            var self = this
            eventsListened.forEach((evt) => {
                newOpt['on' + evt] = self._delegateAndEmit(evt)
            })
            Object.assign(newOpt, this.options)
            new ST(this.$el, newOpt)
        },
        methods: {
            _delegateAndEmit (evt) {
                return (e) => {
                    // 内置这个组件内部的钩子
                    if (typeof this['onDrag' + evt] === 'function') this['onDrag' + evt](e)
                    this.$emit(evt.toLowerCase(), e)
                }
            },
            onDragMove (e) {
                var newArray = Object.assign([], this.value);
                var startIndex = e.startIndex;
                var endIndex = e.endIndex;
                var temp = newArray.splice(startIndex, 1);
                newArray.splice(endIndex, 0, temp[0]);
                debugger;
                this.$emit('input', newArray);
            }
        }
    }
</script>
