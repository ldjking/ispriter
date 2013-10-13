
var fs = require('fs'),
    path = require('path'),

    us = require('underscore'),
    CSSOM = require('cssom'),
    PNG = require('pngjs').PNG,
    GrowingPacker = require('./GrowingPacker'),
    BI = require('./BackgroundInterpreter'),
    nf = require('./node-file'),
    zTool = require('./ztool');

//****************************************************************
// 0. 声明和配置一些常量
//****************************************************************

var CURRENT_DIR =  path.resolve('./');

/** 
 * 默认配置
 * 注意: 所有配置中, 跟路径有关的都必须使用 linux 的目录分隔符 "/", 不能使用 windows 的 "\". 
 */
var DEFAULT_CONFIG = {

    /**
     * 精灵图合并算法, 目前只有 growingpacker
     * 
     * @optional 
     * @default "growingpacker"
     */
    "algorithm": "growingpacker",
    "input": {

        /**
         * @test
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
        "workspace": CURRENT_DIR,

        /**
         * 原 cssRoot
         * 需要进行精灵图合并的 css 文件路径或文件列表, 单个时使用字符串, 多个时使用数组.
         * 
         * @required 
         * @example
         * "cssSource": "../css/";
         * "cssSource": ["../css/style.css", "../css2/*.css"]
         */
        "cssSource": null,

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
         * @default "./sprite/"
         */
        "cssDist": "./sprite/",

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
         * 生成的精灵图的前缀
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
        "combine": false
    }
};

var debuging = true;

var debug = function(msg){
    if(debuging){
        console.log('>>>', +new Date, msg, '\n<<<===================');
    }
}

//****************************************************************
// 1. 读取配置
// 把传入的配置(最简配置或者完整配置等)进行适配和整理
//****************************************************************

/**
 * 读取配置, 支持config 为配置文件名或者为配置对象
 * 
 * @param  {Object|String} config 配置文件或者配置对象
 * @return {Config}        读取并解析完成的配置对象
 */
var readConfig = function(config){
    if(us.isString(config)){
        if(!fs.existsSync(config)){
            throw 'place give in a sprite config or config file!';
        }
        var content = fs.readFileSync(config).toString();
        config = zTool.jsonParse(content);
    }
    config = config || {};

    // 适配最简配置
    if(us.isString(config.input)){
        config.input = {
            cssSource: config.input
        };
    }
    if(us.isString(config.output)){
        config.output = {
            cssSource: config.output
        }
    }

    // 对旧的配置项进行兼容
    config = adjustOldProperty(config);

    // 
    config = zTool.merge({}, DEFAULT_CONFIG, config);

    var cssSource = config.input.cssSource;
    if(!cssSource){
        throw 'there is no cssSource specific!';
    }else if(us.isString(cssSource)){
        cssSource = [cssSource];
    }

    // 读取所有指定的 css 文件
    var cssFiles = [], cssPattern, queryResult;
    for(var i = 0; i < cssSource.length; i++){
        cssPattern = path.normalize(cssSource[i]);

        if(zTool.endsWith(cssPattern, path.sep)){
            cssPattern += '*.css';
        }
        queryResult = nf.query(config.input.workspace, cssPattern);
        cssFiles = cssFiles.concat(queryResult);
    }
    if(!cssFiles.length){
        throw 'there is no any css file contain!';
    }

    // 去重
    cssFiles = us.unique(cssFiles);

    config.input.cssSource = cssFiles;

    // 确保输出路径是个目录
    config.output.cssDist = path.resolve(config.output.cssDist) + path.sep;
    
    // KB 换算成 B
    config.output.maxSingleSize *= 1024;

    // 确保 margin 是整数
    config.output.margin = parseInt(config.output.margin);
    
    // debug(config);
    return config;
}

/**
 * 对旧的配置项做兼容
 * @param  {Config} config 
 * @return {Config}        
 */
var adjustOldProperty = function(config){
    if(!config.input.cssSource && config.input.cssRoot){
        config.input.cssSource = config.input.cssRoot;
        delete config.input.cssRoot;
    }
    if(!config.output.cssDist && config.output.cssRoot){
        config.output.cssDist = config.output.cssRoot;
        delete config.output.cssRoot;
    }
    if(!config.output.imageDist && config.output.imageRoot){
        config.output.imageDist = config.output.imageRoot;
        delete config.output.imageRoot;
    }
    if(!config.output.maxSingleSize && config.output.maxSize){
        config.output.maxSingleSize = config.output.maxSize;
        delete config.output.maxSize;
    }
    return config;
}

//****************************************************************
// 2. CSS 样式处理
//****************************************************************

/**
 * 读取并解析样式表文件   
 * @return {CSSStyleSheet} 
 * @example
 * CSSStyleSheet: {
 *  cssRules: [
 *      { // CSSStyleDeclaration
 *         selectorText: "img",
 *         style: {
 *             0: "border",
 *             length: 1,
 *              border: "none"
 *          }
 *      }
 *   ]
 *  } 
 */
var readStyleSheet = function(fileName) {

    // TODO workspace 未完全测试
    // fileName = path.join(spriteConfig.input.workspace, fileName);
    if(!fs.existsSync(fileName)){
        return null;
    }
    var content = fs.readFileSync(fileName);
    var styleSheet = CSSOM.parse(content.toString());
    return styleSheet;
};

/**
 * CSS Style Declaration 的通用方法定义
 * @type {Object}
 * @example
 * CSSStyleDeclaration: {
 *     0: "border",
 *     1: "color",
 *     length: 2,
 *     border: "none",
 *     color: "#333"
 * }
 */
var BaseCSSStyleDeclaration = {

    /**
     * 把background 属性拆分
     * e.g. background: #fff url('...') repeat-x 0px top;
     */
    splitBackground: function(){
        var background, 
            value;

        if(!this['background']){

            // 有 background 属性的 style 才能拆分 background 
            return;
        }

        // 撕裂 background-position
        if(value = this['background-position']){
            value = value.trim().replace(/\s{2}/g,'').split(' ');
            if(!value[1]){
                value[1] = value[0];
            }
            this['background-position-x'] = value[0];
            this['background-position-y'] = value[1];
        }
        background = BI.analyse(this['background']);
        if(background.length != 1){

            // TODO 暂时跳过多背景的属性
            return;
        }
        background = background[0];
        if(background['background-image']){

            // 把原来缩写的 background 属性删掉
            this.removeProperty('background');

            this.extend(background);
        }
    },

    /**
     * 把 style 里面的 background 属性转换成简写形式, 用于减少代码
     */
    mergeBackgound: function(){
        var background = '', style = this;

        var positionText = this.removeProperty('background-position-x') + ' ' +
                           this.removeProperty('background-position-y');

        style['background-position'] = positionText.trim();

        var toMergeAttrs = [
               'background-color', 'background-image', 'background-position', 
               'background-repeat','background-attachment', 
               'background-origin', 'background-clip'
        ];
        for(var i = 0, item; item = toMergeAttrs[i]; i++) {
            if(style[item]){
                background += this.removeProperty(item) + ' ';
            }
        }
        style['background'] = background.trim();
        style[style.length++] = 'background';
    },

    /**
     * 把 obj 的属性和属性值扩展合并过来, 并调整下标, 方法将被忽略
     * @param  {Object} obj 
     * @param  {Boolean} override 是否覆盖已有属性
     */
    extend: function(obj, override){
        for(var i in obj){
            if(us.isFunction(obj[i])){
                continue;
            }else if(this[i] && !override){
                continue;
            }
            this.setProperty(i, obj[i], null);
        }

    }

}

/**
 * 所用到的一些正则
 */
var regexp = {
    ignoreNetwork: /^(https?|ftp):\/\//i,
    ignorePosition: /right|center|bottom/i,
    ignoreRepeat: /^(repeat-x|repeat-y|repeat)$/i,
    image: /\(['"]?(.+\.(png|jpg|jpeg))(\?.*?)?['"]?\)/i,
    css: /(.+\.css).*/i

}

/**
 * 收集需要合并的样式和图片
 * @param  {CSSStyleSheet} styleSheet 
 * @param  {Object} result StyleObjList
 * @return {Object}     
 * @example
 * result: { // StyleObjList
 *     length: 1,
 *     "./img/icon1.png": { // StyleObj
 *         imageUrl: "./img/icon1.png",
 *         imageAbsUrl: "/User/home/ispriter/test/img/icon1.png",
 *         cssRules: []
 *     }
 * }
 */
var collectStyleRules = function(styleSheet, result, styleSheetUrl){
    if(!result){
        result = { // an StyleObjList
            length: 0
        }
    }

    if(!styleSheet.cssRules.length){
        return result;
    }

    var styleSheetDir = path.dirname(styleSheetUrl);

    // 遍历所有 css 规则收集进行图片合并的样式规则
    styleSheet.cssRules.forEach(function(rule, i){

        // typeof rule === 'CSSStyleRule'
        if(rule.href && rule.styleSheet){

            // @import 引入的样式表, 把 css 文件读取进来继续处理
            var fileName = rule.href;

            // 忽略掉链接到网络上的文件
            if(!fileName || regexp.ignoreNetwork.test(fileName)){
                return;
            }
            var match = fileName.match(regexp.css);
            if(!match){
                return;
            }
            fileName = match[1];

            var url = path.join(styleSheetDir, fileName);
            var styleSheet = readStyleSheet(url);
            debug('read import style: ' + url + ' , has styleSheet == : ' + !!styleSheet);
            if(!styleSheet){
                return;
            }
            rule.styleSheet = styleSheet;
            
            debug('collect import style: ' + fileName);

            // 继续收集 import 的样式
            collectStyleRules(styleSheet, result, url);
            return;
        }

        if(rule.cssRules && rule.cssRules.length){

            // 遇到有子样式的，比如 @media, @keyframes，递归收集
            collectStyleRules(rule, result, styleSheetUrl);
            return;
        }

        if(!rule.style){

            // 有可能 @media 等中没有任何样式, 如: @media xxx {}
            return;
        }

        /* 
         * typeof style === 'CSSStyleDeclaration'
         * 给 style 对象扩展基本的方法
         */
        var style = us.extend(rule.style, BaseCSSStyleDeclaration);

        if(style['background-size']){

            /* 
             * 跳过有 background-size 的样式, 因为:
             * 1. backgrond-size 不能简写在 background 里面, 而拆分 background 之后再组装, 
             *    background 就变成在 background-size 后面了, 会导致 background-size 被 background 覆盖;
             * 2. 拥有 backgrond-size 的背景图片一般都涉及到拉伸, 这类图片是不能合并的
             */
            return;
        }
        if(style['background']){
            
            // 有 background 属性的 style 就先把 background 简写拆分出来
            style.splitBackground();
        }
        
        if(regexp.ignorePosition.test(style['background-position-x']) || 
            regexp.ignorePosition.test(style['background-position-y'])){

            /*
             * background 定位是 right center bottom 的图片不合并
             * 因为这三个的定位方式比较特殊, 浏览器有个自动适应的特性
             * 把刚刚拆分的 background 属性合并并返回
             */
             style.mergeBackgound();
            return;
        }

        if(regexp.ignoreRepeat.test(style['background-repeat']) || 
            regexp.ignoreRepeat.test(style['background-repeat-x']) || 
            regexp.ignoreRepeat.test(style['background-repeat-y'])){

            // 显式的使用了平铺的图片, 也不进行合并
            style.mergeBackgound();
            return;
        }

        var imageUrl, imageAbsUrl;
        if(style['background-image'] && 
            style['background-image'].indexOf(',') == -1 && // TODO 暂时忽略掉多背景的属性
            (imageUrl = getImageUrl(style['background-image']))){
            
            // 遇到写绝对路径的图片就跳过
            if(regexp.ignoreNetwork.test(imageUrl)){

                // 这里直接返回了, 因为一个style里面是不会同时存在两个 background-image 的
                return;
            }
            imageAbsUrl = path.join(styleSheetDir, imageUrl);
            if(!fs.existsSync(imageAbsUrl)){

                // 如果这个图片是不存在的, 就直接返回了, 进行容错
                return;
            }

            // 把用了同一个文件的样式汇集在一起
            if(!result[imageUrl]){
                result[imageUrl] = { // an StyleObj
                    imageUrl: imageUrl,
                    imageAbsUrl: imageAbsUrl,
                    cssRules: []
                };
                result.length++;
            }
            result[imageUrl].cssRules.push(style);
        }
    });
    return result;
}

/**
 * 从background-image 的值中提取图片的路径
 * @return {String}       url
 */
var getImageUrl = function(backgroundImage){
    var format = spriteConfig.input.format;
    var m = backgroundImage.match(regexp.image);
    if(m && format.indexOf(m[2]) > -1){
        return m[1];
    }
    return null;
}
//****************************************************************
// 3. 收集图片相关信息
//****************************************************************

/**
 * 读取图片的内容和大小
 * @param  {StyleObjList}   styleObjList 
 * @param  {Function} onDone     
 */
var readImagesInfo = function(styleObjList, onDone){

    // pngjs 没有提供同步 api, 所以只能用异步的方式读取图片信息
    zTool.forEach(styleObjList, function(styleObj, url, next){

        if(url === 'length'){
            return next(); // 跳过 styleObjList 的 length 字段
        }
        var imageInfo = imageInfoCache[url];

        var onGetImageInfo = function(imageInfo){
            imageInfoCache[url] = imageInfo;

            // 从所有style里面，选取图片宽高最大的作为图片宽高
            setImageWidthHeight(styleObj, imageInfo);

            styleObj.imageInfo = imageInfo;
            next();
        }

        if(imageInfo){
            onGetImageInfo(imageInfo);
        }else{
            readImageInfo(styleObj.imageAbsUrl, onGetImageInfo);
        }
    }, onDone);
}


/**
 * 读取单个图片的内容和信息
 * @param {String} fileName
 * @param {Function} callback callback(ImageInfo)
 * { // ImageInfo
 *     image: null, // 图片数据
 *     width: 0,
 *     height: 0,
 *     size: 0 // 图片数据的大小
 * }
 */
var readImageInfo = function(fileName, callback){
    fs.createReadStream(fileName).pipe(new PNG())
    .on('parsed', function() {

        var imageInfo = {
            image: this,
            width: this.width,
            height: this.height
        };

        getImageSize(this, function(size){

            imageInfo.size = size;
            callback(imageInfo);
        });
    });
}

/**
 * 读取图片内容所占硬盘空间的大小
 * @param  {PNG}   image    
 * @param  {Function} callback callback(Number)
 */
var getImageSize = function(image, callback){
    var size = 0;

    /*
     * 这里读取图片大小的范式比较折腾, pngjs 没有提供直接获取 size 的通用方法, 
     * 同时它只提供了文件流的方式读取, 所以只能一段一段的读取数据时把长度相加
     */
    image.pack().on('data', function(chunk){

        size += chunk.length;
    }).on('end', function(){

        callback(size);
    });
}

/**
 * 把用了同一个图片的样式里写的大小 (with, height) 跟图片的大小相比较, 取最大值,
 * 防止有些样式写的宽高比较大, 导致合并后显示到了周边的图片内容
 * @param {StyleObj} styleObj 
 * @param {ImageInfo} imageInfo 
 */
var setImageWidthHeight = function(styleObj, imageInfo){
    var w = 0, 
        h = 0, 
        mw = imageInfo.width, 
        mh = imageInfo.height
    ;

    // 遍历所有规则, 取最大值
    styleObj.cssRules.forEach(function(style){
        w = getPxValue(style.width),
        h = getPxValue(style.height);
        if(w > mw){
            mw = w;
        }
        if(h > mh){
            mh = h;
        }
    });

    /*
     * 最后的大小还要加上 config 中配置的 margin 值
     * 这里之所以用 w / h 来表示宽高, 而不是用 with / height
     * 是因为 packer 算法限定死了, 值读取传入元素的 w / h 值
     */
    styleObj.w = mw + spriteConfig.output.margin;
    styleObj.h = mh + spriteConfig.output.margin;
}

/**
 * 把像素值转换成数字, 如果没有该值则设置为 0, 
 * 非 px 的值会忽略, 当成 0 来处理
 * @param  {String} cssValue 
 */
var getPxValue = function(cssValue){
    if(cssValue && cssValue.indexOf('px') > -1){
        return parseInt(cssValue);
    }
    return 0;
}

//****************************************************************
// 4. 对图片进行坐标定位
//****************************************************************

/**
 * 对需要合并的图片进行布局定位
 * @param  {StyleObjList} styleObjList 
 * @return {Array} 返回 spriteArrayay 的数组, 
 * SpriteImageArray 的每个元素都是 StyleObj 数组, 
 * 一个 StyleObj 数组包含了一张精灵图的所有小图片
 */
var positionImages = function(styleObjList){
    var styleObj,
        spriteArray = [],
        arr = [], 
        existArr = [], // 保存已经合并过的图片的样式
        maxSize = spriteConfig.output.maxSingleSize,
        packer = new GrowingPacker()
    ;

    // 把已经合并了并已输出的图片先排除掉
    for(var i in styleObjList){
        if(i === 'length'){
            continue;
        }
        styleObj = styleObjList[i];
        if(styleObj.imageInfo.drew){
            existArr.push(styleObj);
        }else{
            arr.push(styleObj);
        }
    }

    // 如果限制了输出图片的大小, 则进行分组
    if(maxSize){

        /* 
         * 限制图片大小的算法是:
         * 1. 先把图片按从大到小排序
         * 2. 顺序叠加图片 size , 超过maxSize 时, 另起一个数组
         * 3. 最终把一个数组, 拆成 N 个 总 szie 小于 maxSize 的数组
         */
        arr.sort(function(a, b){
            return b.imageInfo.size - a.imageInfo.size;
        });
        
        var total = 0, ret = [];
        arr.forEach(function(styleObj){
            total += styleObj.imageInfo.size;

            if(total > maxSize){
                if(ret.length){ // 避免出现空图片
                    spriteArray.push(ret);
                    ret = [];
                    total = styleObj.imageInfo.size;
                }
            }
            ret.push(styleObj);
        });

        if(ret.length){
            spriteArray.push(ret);
        }
    }else{
        spriteArray.push(arr);
    }
    
    spriteArray.forEach(function(arr){

        /* 
         * packer 算法需要把最大的一个放在首位...
         * 排序算法会对结果造成比较大的影响
         */
        arr.sort(function(a, b){
            return b.w * b.h - a.w * a.h;
        });

        // 用 packer 对数组元素进行定位
        packer.fit(arr);

        /* 
         * root 的值就是 packer 定位的结果
         * root.w / root.h 表示图片排列后的总宽高
         * 各个小图片的坐标这在 arr 的元素中, 新增了一个 fit 属性
         * fit.x / fit.y 表示定位后元素的坐标
         */
        arr.root = packer.root;
    });
    if(existArr.length){
        spriteArray.push(existArr);
    }
    return spriteArray;
}

//****************************************************************
// 5. 根据定位合并图片并输出, 同时修改样式表里面的background
//****************************************************************

var drawImageAndPositionBackground = function(spriteObj){
    
    var spriteArray = spriteObj.spriteArray;

    if(!spriteArray[spriteArray.length - 1].root){

        /* 
         * 若最后一个元素, 没有root 属性, 说明它的样式都是复用已合并的图片的, 
         * 直接替换样式即可
         */
        var styleObjArr = spriteArray.pop();

        for(var j = 0, styleObj; styleObj = styleObjArr[j]; j++) {
            
        }
        styleObjArr.forEach(function(styleObj){

            var imageInfo = styleObj.imageInfo;
            styleObj.fit = imageInfo.fit;

            // 修改 background 属性
            replaceAndPositionBackground(imageInfo.imageName, styleObj);
        });
    }

    spriteArray.forEach(function(styleObjArr, i){
        var png, 
            imageName,
            imageAbsName;

        png = createPng(styleObjArr.root.w, styleObjArr.root.h);
        
        imageName = createSpriteImageName(spriteObj.cssFileName, i,
                        spriteArray.length);

        styleObjArr.forEach(function(styleObj){

            var imageInfo = styleObj.imageInfo,
                image = imageInfo.image;
            
            imageInfo.drew = true;
            imageInfo.imageName = imageName;
            imageInfo.fit = styleObj.fit;

            // 修改 background 属性
            replaceAndPositionBackground(imageName, styleObj);
            
            // 对图片进行填充
            image.bitblt(png, 0, 0, image.width, image.height, 
                    imageInfo.fit.x, imageInfo.fit.y);

        });

        // 没必要输出一张空白图片
        if(styleObjArr.length){
            imageAbsName = path.resolve(spriteConfig.output.cssDist + imageName);
            nf.mkdirsSync(path.dirname(imageAbsName));
            png.pack().pipe(fs.createWriteStream(imageAbsName));

            console.log('>>output image:', imageName);
        }
    });
}

/**
 * 创建一个 png 图片
 * @param  {Number} width 
 * @param  {Number} height
 */
var createPng = function(width, height) {
    var png = new PNG({
        width: width,
        height: height
    });

    /*
     * 必须把图片的所有像素都设置为 0, 否则会出现一些随机的噪点
     */
    for (var y = 0; y < png.height; y++) {
        for (var x = 0; x < png.width; x++) {
            var idx = (png.width * y + x) << 2;

            png.data[idx] = 0;
            png.data[idx+1] = 0;
            png.data[idx+2] = 0;

            png.data[idx+3] = 0;
        }
    }
    return png;
}

/**
 * 创建精灵图的文件名, 前缀 + css 文件名 + 文件后缀, 如果设置了 maxSingleSize, 
 * 则会在文件名后面加上下标
 * @param  {String} cssFileName 
 * @param  {Number} index       
 * @param  {Number} total       
 */
var createSpriteImageName = function(cssFileName, index, total){

    var name = '';
    if(cssFileName){ // 去掉文件后缀, 提取出文件名字
        var basename = path.basename(cssFileName);
        var extname = path.extname(basename);
        name = basename.replace(extname, '');
    }

    // 设置了 maxSingleSize, 文件名会是类似 _1, _2 这种
    if(spriteConfig.output.maxSingleSize && total > 1){
        name += (spriteConfig.output.combine ? '' : '_') + index;
    }else if(spriteConfig.output.combine){
        name = 'all';
    }
    return spriteConfig.output.imageDist + spriteConfig.output.prefix +
        name + '.' + spriteConfig.output.format;
}

/**
 * 把合并的结果写到样式中, 修改 background-image 和 background-position 属性,
 * 并且把 background 的字属性都合并掉
 * @param  {String} imageName   
 * @param  {StyleObj} styleObj    
 */
var replaceAndPositionBackground = function(imageName, styleObj){
    styleObj.cssRules.forEach(function(style){

        style['background-image'] = 'url(' + imageName + ')';

        // set background-position-x
        setPxValue(style, 'background-position-x', styleObj.fit.x);

        // set background-position-y
        setPxValue(style, 'background-position-y', styleObj.fit.y);

        // mergeBackgound, 合并 background 属性, 减少代码量
        style.mergeBackgound();
    });
}

/**
 * 调整 样式规则的像素值, 如果原来就有值, 则在原来的基础上变更
 */
var setPxValue = function(style, attr, newValue){
    var value;
    if(style[attr]){
        value = parseInt(style[attr]);
    }else{
        value = 0;
        style[style.length++] = attr;
    }
    value = value - newValue;
    value = value ? value + 'px' : '0';
    style[attr] = value;
}

//****************************************************************
// 6. 合并所有 spriteObj
//****************************************************************

/**
 * 合并所有 spriteObj
 * @param  {Array} spriteObjArray 
 * @return {Array} 转换后的 SpriteObj 数组, 只会包含一个 SpriteObj
 */
var mergeCombineSprites = function(spriteObjArray){

    var combineFileName,
        combineSpriteObj,
        combineStyleSheetArray = [],
        combineStyleObjList = { length: 0 };

    combineFileName = spriteConfig.output.cssDist + spriteConfig.output.prefix +
                      'all.css';
    combineFileName = path.resolve(combineFileName);

    spriteObjArray.forEach(function(spriteObj){
        
        // var spriteObj = { // an SpriteObj
        //     cssFileName: cssFileName, // css 文件的路径
        //     styleSheet: readStyleSheet(cssFileName), // css 文件的内容
        //     styleObjList: null, // 搜集到的需要合并图片的样式和相关图片信息(大小宽高等)
        // };
        
        var styleObj,
            existSObj,
            styleObjList = spriteObj.styleObjList;

        for(var url in styleObjList){
            if(url === 'length'){
                continue;
            }
            styleObj = styleObjList[url];
            if(existSObj = combineStyleObjList[url]){
                existSObj.cssRules = existSObj.cssRules.concat(styleObj.cssRules);
            }else{
                combineStyleObjList[url] = styleObj;
                combineStyleObjList.length++;
            }
        }

        combineStyleSheetArray.push(spriteObj.styleSheet);
    });

    combineSpriteObj = {
        cssFileName: combineFileName,
        styleSheetArray: combineStyleSheetArray,
        styleObjList: combineStyleObjList
    }

    return [combineSpriteObj];
}

//****************************************************************
// 7. 输出修改后的样式表    
//****************************************************************

/**
 * 输出修改后的样式表
 * @param  {SpriteObj} spriteObj        
 */
var exportCssFile = function(spriteObj){
    var styleSheetArray = spriteObj.styleSheetArray;
    if(!styleSheetArray){
        styleSheetArray = [spriteObj.styleSheet]
    }
    
    // var fileName, spriteObj, cssContentList = [];
    // for(var i in spriteObjArray){
    //     spriteObj = spriteObjArray[i];
    //     fileName = spriteConfig.output.cssRoot + spriteObj.fileName;
    //     fileName = path.resolve(fileName);
    //     if(spriteConfig.output.combine){
    //         cssContentList.push(styleSheetToString(spriteObj.styleSheet));
    //     }else{
    //         nf.writeFileSync(fileName, styleSheetToString(spriteObj.styleSheet), true);
    //     }
    // }
    // if(spriteConfig.output.combine && cssContentList.length){
    //     fileName = spriteConfig.output.cssRoot + spriteConfig.output.prefix + 'all.css';
    //     fileName = path.resolve(fileName);
    //     nf.writeFileSync(fileName, cssContentList.join(''), true);
    // }
    console.log('>>output css:', spriteObj.cssFileName);
}


var styleSheetToString = function(styleSheet) {
    var result = "";
    var rules = styleSheet.cssRules, rule;
    for (var i=0; i<rules.length; i++) {
        rule = rules[i];
        if(rule instanceof CSSOM.CSSImportRule){
            result += styleSheetToString(rule.styleSheet) + '\n';
        }else{
            result += rule.cssText + '\n';
        }
    }
    return result;
};


//****************************************************************
// 主逻辑
//****************************************************************

// sprite 的配置
var spriteConfig = null;

// sprite 缓存
var spriteCache = null;

// sprite 完成之后的回调
var onSpriteDone = null;

// 记录 sprite 开始的时间
var spriteStart = 0;

// 图片信息缓存
var imageInfoCache = null;

// sprite 数据的缓存, 用于需要合并所有 css 文件和图片的情况
var spriteObjArray = null;

/**
 * sprite 开始之前执行的函数
 */
var onSpriteStart = function(){
    spriteStart = +new Date;
}

/**
 * sprite 完成之后执行的函数
 */
var onSpriteEnd = function(){
    var timeUse = +new Date - spriteStart;
    console.log('>>all done. time use:', timeUse, 'ms');
    onSpriteDone && onSpriteDone(timeUse);
}

/**
 * ispriter 的主要入口函数
 * @param  {Object|String} config ispriter 的配置对象或者是配置文件, 
 * 如不清楚请参照 README.md
 * @param {Function} done 当精灵图合并完成后触发
 */
exports.merge = function(config, done){
    onSpriteStart();

    spriteCache = {};
    onSpriteDone = done;

    imageInfoCache = {};
    spriteObjArray = [];

    // 1. 读取和处理合图配置
    spriteConfig = readConfig(config);

    // 2. 读取文件内容并解析, 读取相关图片的信息
    zTool.forEach(spriteConfig.input.cssSource, function(cssFileName, i, next){ // onEach

        var spriteObj = { // an SpriteObj
            cssFileName: cssFileName, // css 文件的路径
            styleSheet: readStyleSheet(cssFileName), // css 文件的内容
            styleObjList: null, // 搜集到的需要合并图片的样式和相关图片信息(大小宽高等)
            spriteArray: null // 精灵图的所有小图片数组
        };
        // debug(spriteObj.styleSheet);
        // 收集需要合并的图片信息
        var styleObjList = collectStyleRules(spriteObj.styleSheet, null, cssFileName);
        spriteObj.styleObjList = styleObjList;

        if(!styleObjList.length){
            next(); // 这个 css 没有需要合并的图片
        }else{

            // 把结果塞到列表中方便 combine 使用
            spriteObjArray.push(spriteObj);

            // 读取图片的内容, 宽高和大小
            readImagesInfo(styleObjList, next);
        }
    }, function(){ // onDone

        // 3. 对小图片进行定位排列和输出, 输出合并后的 css 文件

        if(spriteConfig.output.combine){

            // 如果指定了 combine, 先把所有 cssRules 和 styleSheet 合并
            spriteObjArray = mergeCombineSprites(spriteObjArray);
        }
        spriteObjArray.forEach(function(spriteObj){

            // spriteArray 的每个元素就是每张精灵图
            var spriteArray = positionImages(spriteObj.styleObjList);
            spriteObj.spriteArray = spriteArray;

            // 输出合并的图片 并修改样式表里面的background
            drawImageAndPositionBackground(spriteObj);

            // 输出修改后的样式表
            exportCssFile(spriteObj);
        });

        // 大功告成
        onSpriteEnd();
    });

}

// Task.JS Specification API https://github.com/taskjs/spec
exports.run = function(options, done){
    exports.merge(options, done);
}

//****************************************************************
// 0000. for test
//****************************************************************
exports.merge('./config.example.json');