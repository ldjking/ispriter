var path = require('path');

exports.CURRENT_DIR =  path.resolve('./');

exports.DEFAULT_COMBINE_CSS_NAME = 'all.css';

/**
 * 所用到的一些正则
 */
exports.REGEXP_IGNORE_NETWORK = /^(https?|ftp):\/\//i;

exports.REGEXP_IGNORE_POSSITION = /right|center|bottom/i;

exports.REGEXP_IGNORE_REPEAT = /^(repeat-x|repeat-y|repeat)$/i;

exports.REGEXP_IGNORE_IMAGE = /#unsprite\b/i;

exports.REGEXP_IMAGE = /\(['"]?(.+\.(png|jpg|jpeg))((\?|#).*?)?['"]?\)/i;

exports.REGEXP_CSS = /(.+\.css).*/i;

/** 
 * 默认配置
 * 注意: 所有配置中, 跟路径有关的都必须使用 linux 的目录分隔符 "/", 不能使用 windows 的 "\". 
 */
exports.DEFAULT_CONFIG = {

    /**
     * 调试时使用, 输出调试日志
     */
    "debug": false,

    /**
     * 精灵图合并算法, 目前只有 growingpacker
     * 
     * @optional 
     * @default "growingpacker"
     */
    "algorithm": "growingpacker",

    /**
     * 工作目录, 可以是相对路径或者绝对路径
     * 
     * @optional
     * @default 运行 ispriter 命令时所在的目录
     * @example
     * "./": 当前运行目录, 默认值
     * "../": 当前目录的上一级
     * "/data": 根目录下的 data 目录
     * "D:\\sprite": D 盘下的 sprite 目录
     */
    "workspace": exports.CURRENT_DIR,

    "input": {

        /**
         * 原 cssRoot
         * 需要进行精灵图合并的 css 文件路径或文件列表, 单个时使用字符串, 多个时使用数组.
         * 路径可使用 ant 风格的路径写法
         * 
         * @required 
         * @example
         * "cssSource": "../css/";
         * "cssSource": ["../css/style.css", "../css2/*.css"]
         */
        "cssSource": null,

        /**
         * 排除不想合并的图片, 可使用通配符
         * 也可以直接在 css 文件中, 在不想合并的图片 url 后面添加 #unsprite, iSpriter 会排除该图片, 并把 #unsprite 删除
         * 
         * @optional
         * @example
         * "ignoreImages": "icons/*"
         * "ignoreImages": ["icons/*", "loading.png"]
         */
        "ignoreImages": null,

        /**
         * 输出的精灵图的格式, 目前只支持输出 png 格式, 
         * 如果是其他格式, 也是以PNG格式输出, 仅仅把后缀改为所指定后缀
         * 
         * @optional 
         * @default "png"
         */
        "format": "png"
    },
    "output": {

        /**
         * 原 cssRoot
         * 精灵图合并之后, css 文件的输出目录
         * 
         * @optional 
         * @default "./sprite/css/"
         */
        "cssDist": "./sprite/css/",

        /**
         * 原 imageRoot
         * 生成的精灵图相对于 cssDist 的路径, 最终会变成合并后的的图片路径写在 css 文件中
         * 
         * @optional
         * @default "./img/"
         * @example
         * 如果指定 imageDist 为 "./images/sprite/", 则在输出的 css 中会显示为
         * background: url("./images/sprite/sprite_1.png");
         * 
         */
        "imageDist": "./img/",

        /**
         * 原 maxSize
         * 单个精灵图的最大大小, 单位 KB, 
         * 如果合并之后图片的大小超过 maxSingleSize, 则会对图片进行拆分
         *
         * @optional 
         * @default 0
         * @example
         * 如指定 "maxSingleSize": 60, 而生成的精灵图(sprite_all.png)的容量为 80KB, 
         * 则会把精灵图拆分为 sprite_0.png 和 sprite_1.png 两张
         * 
         */
        "maxSingleSize": 0,

        /**
         * 合成之后, 图片间的空隙, 单位 px
         * 
         * @optional 
         * @default 0
         */
        "margin": 0,

        /**
         * 配置生成的精灵图的前缀
         * 
         * @optional
         * @default "sprite_"
         */
        "prefix": "sprite_",

        /**
         * 精灵图的输出格式
         * 
         * @optional
         * @default "png"
         */
        "format": "png",

        /**
         * 配置是否要将所有精灵图合并成为一张, 当有很多 css 文件输入的时候可以使用.
         * 为 true 时将所有图片合并为一张, 同时所有 css 文件合并为一个文件.
         * 注意: 此时 maxSingleSize 仍然生效, 超过限制时也会进行图片拆分
         * 
         * @optional
         * @default false
         */
        "combine": false,

        /**
         * 配置是否把合并了图片的样式整合成一条规则, 统一设置 background-image, 例如:
         * .cls1, .cls2{
         *     background-image: url(xxx);
         * }
         * 
         * @optional
         * @default true
         */
        "combineCSSRule": true,

        /**
         * 配置是否压缩 css 文件, 将使用 clean-css 进行压缩, 其值如下:
         * false: 不进行压缩; 
         * true: 用 clean-css 的默认配置进行压缩; 
         * Object{"keepBreaks": true, ... }: 用指定的配置进行压缩.
         *
         * @optional
         * @default false
         */
        "compress": false,

        /**
         * 配置是否把没有合并的图片进行拷贝, 默认是不不会进行拷贝的
         *
         * @optional
         * @default false
         */
        "copyUnspriteImage": false
    }
};