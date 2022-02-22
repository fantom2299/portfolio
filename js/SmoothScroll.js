

(function(){
  
// Scroll Variables (tweakable)
    let options = {

    // Scrolling Core
    frameRate: 150, // [Hz]
    animationTime: 400, // [px]
    stepSize: 120, // [px]

    // Pulse (less tweakable)
    // ratio of "tail" to "acceleration"
    pulseAlgorithm: true,
    pulseScale: 8,
    pulseNormalize: 1,

    // Acceleration
    accelerationDelta: 20,  // 20
    accelerationMax: 1,   // 1

    // Keyboard Settings
    keyboardSupport: true,  // option
    arrowScroll: 50,     // [px]

    // Other
    touchpadSupport: true,
    fixedBackground: true,
    excluded: ""
};


// Other Variables
let isExcluded = false;
let isFrame = false;
let direction = { x: 0, y: 0 };
let initDone  = false;
let root = document.documentElement;
let activeElement;
let observer;
let deltaBuffer = [ 120, 120, 120 ];

let key = { left: 37, up: 38, right: 39, down: 40, spacebar: 32,
            pageup: 33, pagedown: 34, end: 35, home: 36 };


/***********************************************
 * INITIALIZE
 ***********************************************/

/**
 * Проверяет, разрешена ли плавная прокрутка. Выключает все, если нет.
 */
function initTest() {

    let disableKeyboard = false;
    
    // disable keyboard support if anything above requested it
    if (disableKeyboard) {
        removeEvent("keydown", keydown);
    }

    if (options.keyboardSupport && !disableKeyboard) {
        addEvent("keydown", keydown);
    }
}

/**
 * Устанавливает массив скроллов, определяет, задействованы ли фреймы.
 */
function init() {
  
    if (!document.body) return;

    let body = document.body;
    let html = document.documentElement;
    let windowHeight = window.innerHeight;
    let scrollHeight = body.scrollHeight;
    
    // check compat mode for root element
    root = (document.compatMode.indexOf('CSS') >= 0) ? html : body;
    activeElement = body;
    
    initTest();
    initDone = true;

    // проверить режим совместимости для корневого элемента
    if (top !== self) {
        isFrame = true;
    }

    /**
     * Это исправляет ошибку, при которой области слева и справа
     * контент не запускает событие onmousewheel
     * на некоторых страницах. например: html, body {height: 100%}
     */
    else if (scrollHeight > windowHeight &&
            (body.offsetHeight <= windowHeight || 
             html.offsetHeight <= windowHeight)) {

        html.style.height = 'auto';
        setTimeout( refresh, 10);

        // clearfix
        if (root.offsetHeight <= windowHeight) {
            let underlay = document.createElement("div");
            underlay.style.clear = "both";
            body.appendChild(underlay);
        }
    }

    // запрещать fixed background
    if (!options.fixedBackground && !isExcluded) {
        body.style.backgroundAttachment = "scroll";
        html.style.backgroundAttachment = "scroll";
    }
}

 
let que = [];
let pending = false;
let lastScroll = +new Date;

/**
 * Перемещает действия прокрутки в очередь прокрутки.
 */
function scrollArray(elem, left, top, delay) {
    
    delay || (delay = 1000);
    directionCheck(left, top);

    if (options.accelerationMax !== 1) {
        let now = +new Date;
        let elapsed = now - lastScroll;
        if (elapsed < options.accelerationDelta) {
            let factor = (1 + (30 / elapsed)) / 2;
            if (factor > 1) {
                factor = Math.min(factor, options.accelerationMax);
                left *= factor;
                top  *= factor;
            }
        }
        lastScroll = +new Date;
    }          
    
    // нажать команду прокрутки не действовать,
    que.push({
        x: left, 
        y: top, 
        lastX: (left < 0) ? 0.99 : -0.99,
        lastY: (top  < 0) ? 0.99 : -0.99, 
        start: +new Date
    });
        
    // если есть ожидающая очередь
    if (pending) {
        return;
    }  

    let scrollWindow = (elem === document.body);
    
    let step = function (time) {
        
        let now = +new Date;
        let scrollX = 0;
        let scrollY = 0;
    
        for (let i = 0; i < que.length; i++) {
            
            let item = que[i];
            let elapsed  = now - item.start;
            let finished = (elapsed >= options.animationTime);
            
            // scroll position: [0, 1]
            let position = (finished) ? 1 : elapsed / options.animationTime;
            
            // easing [optional]
            if (options.pulseAlgorithm) {
                position = pulse(position);
            }
            
            // нужна только разница, добавьте это к общей прокрутке
            let x = (item.x * position - item.lastX) >> 0;
            let y = (item.y * position - item.lastY) >> 0;
            
            // добавьте это к общей прокрутке
            scrollX += x;
            scrollY += y;            
            
            // обновить последние значения
            item.lastX += x;
            item.lastY += y;
        
            // удалить и отступить, если все закончилось
            if (finished) {
                que.splice(i, 1); i--;
            }           
        }

        // scroll left and top
        if (scrollWindow) {
            window.scrollBy(scrollX, scrollY);
        } 
        else {
            if (scrollX) elem.scrollLeft += scrollX;
            if (scrollY) elem.scrollTop  += scrollY;                    
        }
        
        // убирайся, если нечего делать
        if (!left && !top) {
            que = [];
        }
        
        if (que.length) { 
            requestFrame(step, elem, (delay / options.frameRate + 1)); 
        } else { 
            pending = false;
        }
    };
    
    // начать новую очередь действий
    requestFrame(step, elem, 0);
    pending = true;
}

/**
 * Обработчик колесика мыши.
 * @param {Object} event
 */
function wheel(event) {

    event.wheelDeltaX = undefined;
    event.wheelDeltaY = undefined;
    if (!initDone) {
        init();
    }
    
    
    let target = event.target;
    let overflowing = overflowingAncestor(target);
    
    // использовать по умолчанию, если нет переполнения
    // элемент или действие по умолчанию запрещено
    if (!overflowing || event.defaultPrevented ||
        isNodeName(activeElement, "embed") ||
       (isNodeName(target, "embed") && /\.pdf/i.test(target.src))) {
        return true;
    }

    let  deltaX = event.wheelDeltaX || 0;
    let deltaY = event.wheelDeltaY || 0;
    
    // используйте wheelDelta, если deltaX / Y недоступно 
    if (!deltaX && !deltaY) {
        deltaY = event.wheelDelta || 0;
    }

    // проверьте, следует ли игнорировать прокрутку сенсорной панели
    if (!options.touchpadSupport && isTouchpad(deltaY)) {
        return true;
    }

    // масштабировать по размеру шага
    // в большинстве случаев дельта равна 120
    // кажется, что синаптика иногда отправляет 1
    if (Math.abs(deltaX) > 1.2) {
        deltaX *= options.stepSize / 120;
    }
    if (Math.abs(deltaY) > 1.2) {
        deltaY *= options.stepSize / 120;
    }
    
    scrollArray(overflowing, -deltaX, -deltaY);
    event.preventDefault();
}

/**
 * Keydown event handler.
 * @param {Object} event
 */
function keydown(event) {

    let target   = event.target;
    let modifier = event.ctrlKey || event.altKey || event.metaKey ||
                  (event.shiftKey && event.keyCode !== key.spacebar);
    
    // ничего не делать, если пользователь редактирует текст
    // или с помощью клавиши-модификатора (кроме shift)
    // или в раскрывающемся списке
    if ( /input|textarea|select|embed/i.test(target.nodeName) ||
         target.isContentEditable || 
         event.defaultPrevented   ||
         modifier ) {
      return true;
    }
    // пробел должен вызвать нажатие кнопки
    if (isNodeName(target, "button") &&
        event.keyCode === key.spacebar) {
      return true;
    }
    
    let shift, x = 0, y = 0;
    let elem = overflowingAncestor(activeElement);
   let clientHeight = elem.clientHeight;

    if (elem === document.body) {
        clientHeight = window.innerHeight;
    }

    switch (event.keyCode) {
        case key.up:
            y = -options.arrowScroll;
            break;
        case key.down:
            y = options.arrowScroll;
            break;         
        case key.spacebar: // (+ shift)
            shift = event.shiftKey ? 1 : -1;
            y = -shift * clientHeight * 0.9;
            break;
        case key.pageup:
            y = -clientHeight * 0.9;
            break;
        case key.pagedown:
            y = clientHeight * 0.9;
            break;
        case key.home:
            y = -elem.scrollTop;
            break;
        case key.end:
            let damt = elem.scrollHeight - elem.scrollTop - clientHeight;
            y = (damt > 0) ? damt+10 : 0;
            break;
        case key.left:
            x = -options.arrowScroll;
            break;
        case key.right:
            x = options.arrowScroll;
            break;            
        default:
            return true; // ключ, о котором мы не заботимся
    }

    scrollArray(elem, x, y);
    event.preventDefault();
}


function mousedown(event) {
    activeElement = event.target;
}


 
let cache = {}; // очищается время от времени
setInterval(function () { cache = {}; }, 10 * 1000);

let uniqueID = (function () {
    let i = 0;
    return function (el) {
        return el.uniqueID || (el.uniqueID = i++);
    };
})();

function setCache(elems, overflowing) {
    for (let i = elems.length; i--;)
        cache[uniqueID(elems[i])] = overflowing;
    return overflowing;
}

function overflowingAncestor(el) {
    let elems = [];
    let rootScrollHeight = root.scrollHeight;
    do {
        let cached = cache[uniqueID(el)];
        if (cached) {
            return setCache(elems, cached);
        }
        elems.push(el);
        if (rootScrollHeight === el.scrollHeight) {
            if (!isFrame || root.clientHeight + 10 < rootScrollHeight) {
                return setCache(elems, document.body); // scrolling root in WebKit
            }
        } else if (el.clientHeight + 10 < el.scrollHeight) {
            let overflow = getComputedStyle(el, "").getPropertyValue("overflow-y");
            if (overflow === "scroll" || overflow === "auto") {
                return setCache(elems, el);
            }
        }
    } while (el === el.parentNode);
}


function addEvent(type, fn, bubble) {
    window.addEventListener(type, fn, (bubble||false));
}

function removeEvent(type, fn, bubble) {
    window.removeEventListener(type, fn, (bubble||false));  
}

function isNodeName(el, tag) {
    return (el.nodeName||"").toLowerCase() === tag.toLowerCase();
}

function directionCheck(x, y) {
    x = (x > 0) ? 1 : -1;
    y = (y > 0) ? 1 : -1;
    if (direction.x !== x || direction.y !== y) {
        direction.x = x;
        direction.y = y;
        que = [];
        lastScroll = 0;
    }
}

let deltaBufferTimer;

function isTouchpad(deltaY) {
    if (!deltaY) return;
    deltaY = Math.abs(deltaY)
    deltaBuffer.push(deltaY);
    deltaBuffer.shift();
    clearTimeout(deltaBufferTimer);

    let allEquals    = (deltaBuffer[0] === deltaBuffer[1] &&
                        deltaBuffer[1] === deltaBuffer[2]);
    let allDivisable = (isDivisible(deltaBuffer[0], 120) &&
                        isDivisible(deltaBuffer[1], 120) &&
                        isDivisible(deltaBuffer[2], 120));
    return !(allEquals || allDivisable);
} 

function isDivisible(n, divisor) {
    return (Math.floor(n / divisor) === n / divisor);
}

let requestFrame = (function () {
      return  window.requestAnimationFrame       || 
              window.webkitRequestAnimationFrame || 
              function (callback, element, delay) {
                  window.setTimeout(callback, delay || (1000/60));
              };
})();


 
/**
 * Вязкая жидкость с импульсом для части и распадом для остальных.
 * - Применяет фиксированную силу в течение определенного интервала (затухающее ускорение), и
 * - Позволяет экспоненте сбрасывать скорость за более длительный интервал.
 */
function pulse_(x) {
    let val, start, expx;
    // test
    x = x * options.pulseScale;
    if (x < 1) { // acceleartion
        val = x - (1 - Math.exp(-x));
    } else {     // tail
        // the previous animation ended here:
        start = Math.exp(-1);
        // simple viscous drag
        x -= 1;
        expx = 1 - Math.exp(-x);
        val = start + (expx * (1 - start));
    }
    return val * options.pulseNormalize;
}

function pulse(x) {
    if (x >= 1) return 1;
    if (x <= 0) return 0;

    if (options.pulseNormalize === 1) {
        options.pulseNormalize /= pulse_(1);
    }
    return pulse_(x);
}

let isChrome = /chrome/i.test(window.navigator.userAgent);
let isMouseWheelSupported = 'onmousewheel' in document;

if (isMouseWheelSupported && isChrome) {
	addEvent("mousedown", mousedown);
	addEvent("mousewheel", wheel);
	addEvent("load", init);
}

})();