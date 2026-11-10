/* STV website: language switch (English / Arabic, saved in localStorage), screenshot tabs, captions, reveal on scroll. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var AR = {
    'skip': 'تخطَّ إلى المحتوى',
    'nav.features': 'المزايا', 'nav.customize': 'التخصيص', 'nav.demo': 'العرض', 'nav.install': 'التثبيت', 'nav.faq': 'الأسئلة',
    'nav.download': 'تحميل',
    'hero.eyebrow': 'واجهة رئيسية لأجهزة Android TV · كانت باسم Solitary TV',
    'hero.tagline': 'تلفزيونك. مساحتك.',
    'hero.lead': 'واجهة رئيسية هادئة وسينمائية لأجهزة Android TV. تطبيقاتك وفئاتك وخلفياتك وشاشات التوقف في مكان واحد، وكلها بالريموت',
    'hero.download': 'تحميل لأجهزة Android TV', 'hero.demo': 'شاهد العرض', 'hero.github': 'المشروع على GitHub',
    'hero.free': 'مجاني ومفتوح المصدر', 'release.stable': 'مستقر',
    'show.label': 'الواجهة', 'show.title': 'كل شيء في شاشة واحدة هادئة',
    'show.text': 'لقطات حقيقية من STV على جهاز Android TV. تنقّل بالريموت واضغط موافق وتوصل',
    'show.home': 'الرئيسية', 'show.categories': 'الفئات', 'show.music': 'موسيقى', 'show.arabic': 'العربية', 'show.settings': 'الإعدادات',
    'feat.label': 'المزايا', 'feat.title': 'مصمم للكنبة، مو للماوس',
    'f1.t': 'الرئيسية', 'f1.d': 'الساعة والتاريخ والتحية، والطقس ومواقيت الصلاة، وأكثر خمسة تطبيقات تستخدمها',
    'f2.t': 'الفئات', 'f2.d': 'أفلام ومسلسلات، أنمي، البث المباشر، موسيقى، وفئاتك الخاصة. أعد تسميتها وأخفها ورتبها',
    'f3.t': 'الخلفيات', 'f3.d': 'خلفيات داكنة جاهزة، ومنظر حي يتغير مع الطقس، أو صورتك الخاصة',
    'f4.t': 'شاشات التوقف', 'f4.d': 'تبدأ لما يكون التلفزيون خامل، وتعرض الوقت والتاريخ والطقس والصلاة القادمة على خلفية هادئة',
    'f5.t': 'الخطوط', 'f5.d': 'اختر الخط العربي والإنجليزي كلًّا على حدة مع معاينة مباشرة',
    'f6.t': 'أصوات التنقل', 'f6.d': 'أربعة أنماط أصوات أصلية وثلاثة مستويات، ولا تتراكم لو ضغطت مطولًا',
    'f7.t': 'عربي وإنجليزي', 'f7.d': 'بدّل فورًا، والواجهة كاملة تنعكس من اليمين لليسار بالعربي',
    'f8.t': 'مصمم للريموت', 'f8.d': 'الأسهم وموافق والرجوع في كل مكان، وزر القائمة يفتح لوحة سريعة فيها اللي تحتاجه',
    'f9.t': 'النسخ الاحتياطي', 'f9.d': 'احفظ إعداداتك على التلفزيون أو صدّرها لملف، واستعدها متى ما بغيت',
    'cust.label': 'خلّه لك', 'cust.title': 'غيّر الشكل وأنت على الكنبة',
    'cust.text': 'كل معرض يعاين التغيير وأنت تتنقل، وموافق يحفظه والرجوع يلغيه',
    'c1.t': 'الخلفيات', 'c1.d': 'معاينة مباشرة، وطريقة العرض، والتعتيم',
    'c2.t': 'شاشات التوقف', 'c2.d': 'الأنماط، والعرض المتتالي، ووقت البدء، وما يظهر',
    'c3.t': 'الخطوط', 'c3.d': 'Cairo وTajawal وIBM Plex وInter أو خط النظام',
    'c4.t': 'الشعارات', 'c4.d': 'تسعة أشكال لشعار STV أو النص الكلاسيكي',
    'c5.t': 'الفئات', 'c5.d': 'تبويباتك أنت وبترتيبك أنت',
    'demo.label': 'شوفه يتحرك', 'demo.title': '36 ثانية على تلفزيون حقيقي', 'demo.text': 'مسجّل على جهاز Android TV يشغّل STV 1.5.1',
    'demo.fallback': 'تحميل الفيديو',
    'dl.label': 'التحميل', 'dl.title': 'حمّل STV لأجهزة Android TV', 'dl.version': 'الإصدار', 'dl.type': 'النوع', 'dl.platform': 'المنصة',
    'dl.req': 'المتطلبات', 'dl.reqv': 'Android 8.0 أو أحدث', 'dl.size': 'الحجم', 'dl.license': 'الترخيص', 'dl.button': 'تحميل STV',
    'dl.notes': 'ملاحظات الإصدار ↗', 'dl.note': 'جُرّب على جهاز بنظام Android 12. الطقس ومواقيت الصلاة مضبوطة على جدة في هذا الإصدار',
    'in.label': 'التثبيت', 'in.title': 'ثبّته خلال دقائق',
    's1.t': 'اسمح بالتثبيت', 's1.d': 'من إعدادات التلفزيون اسمح لمدير الملفات أو تطبيق التحميل بتثبيت التطبيقات غير المعروفة، وغالبًا تلقاه في التطبيقات ← الوصول الخاص',
    's2.t': 'نزّل الملف', 's2.d': 'نزّل STV-v1.5.1-AndroidTV.apk على التلفزيون، أو انسخه لمجلد Download',
    's3.t': 'ثبّت وافتح', 's3.d': 'افتح الملف واختر تثبيت. يظهر في قائمة التطبيقات باسم Solitary TV حاليًا',
    's4.t': 'خلّه الرئيسية لو حاب', 's4.d': 'من STV: الإعدادات ← النظام والعام ← اختيار تطبيق HOME الافتراضي، وتقدر ترجع بنفس الطريقة متى ما بغيت',
    'in.adb': 'جهازك ما فيه خيار الواجهة الرئيسية؟ عيّنها من الكمبيوتر عبر ADB',
    'faq.label': 'أسئلة', 'faq.title': 'معلومات تهمك',
    'q1': 'هل STV مجاني؟', 'a1': 'نعم. مجاني ومفتوح المصدر بترخيص MIT، بدون إعلانات وبدون حساب',
    'q2': 'هل يحتاج روت؟', 'a2': 'لا. تطبيق Android عادي، وما يعطّل ولا يحذف أي شيء في تلفزيونك',
    'q3': 'أقدر أغيّر الخلفية؟', 'a3': 'نعم. اختر خلفية جاهزة، أو المنظر الحي، أو استورد صورتك',
    'q4': 'أقدر أسوي فئات خاصة؟', 'a4': 'نعم. أنشئ الفئات وأعد تسميتها وأخفها ورتبها، واختر التطبيقات اللي في كل فئة',
    'q5': 'يدعم العربي؟', 'a5': 'نعم. الواجهة كاملة بالعربي والإنجليزي، مع اتجاه صحيح من اليمين لليسار وخطوط عربية',
    'q6': 'الطقس يشتغل في مدينتي؟', 'a6': 'في الإصدار 1.5.1 الطقس ومواقيت الصلاة مضبوطة على جدة. اختيار المدينة غير متوفر حاليًا، والمطورين يقدرون يغيرونها من الكود ويبنون نسختهم',
    'q7': 'كيف أحدّثه؟', 'a7': 'ثبّت ملف APK الجديد فوق الحالي وإعداداتك تبقى. لا تحذفه قبل',
    'q8': 'كيف أرجع لواجهتي السابقة؟', 'a8': 'اخترها من جديد كتطبيق HOME الافتراضي في إعدادات Android، أو احذف STV',
    'q9': 'هل يشتغل على جهازي؟', 'a9': 'يحتاج Android TV أو Google TV بإصدار Android 8.0 أو أحدث. جُرّب على جهاز واحد بنظام Android 12، فجرّبه كتطبيق عادي قبل ما تخليه الرئيسية',
    'sup.title': 'عجبك STV؟', 'sup.text': 'بلّغ عن مشكلة أو اسأل في X، أو تبرّع عشان المشروع يكبر',
    'sup.support': 'تبرّع', 'sup.issues': 'بلّغ عن مشكلة',
    'foot.text': 'واجهة رئيسية قابلة للتخصيص لأجهزة Android TV', 'foot.download': 'تحميل', 'foot.support': 'تبرّع',
    'foot.license': 'ترخيص MIT', 'foot.part': 'ضمن مجموعة Syntra'
  };
  var ALT = {
    en: { 'home': 'STV home screen with clock, weather, prayer times and five apps', 'categories': 'Movies and Shows category in STV',
      'music': 'Music category in STV', 'home-arabic': 'STV home screen in Arabic', 'appearance-settings': 'STV appearance settings',
      'wallpapers': 'Wallpaper gallery in STV', 'screensaver-gallery': 'Screensaver gallery in STV', 'fonts': 'Arabic font picker in STV',
      'logo-gallery': 'STV logo gallery' },
    ar: { 'home': 'الشاشة الرئيسية في STV مع الساعة والطقس ومواقيت الصلاة وخمسة تطبيقات', 'categories': 'فئة الأفلام والمسلسلات في STV',
      'music': 'فئة الموسيقى في STV', 'home-arabic': 'الشاشة الرئيسية في STV بالعربي', 'appearance-settings': 'إعدادات المظهر في STV',
      'wallpapers': 'معرض الخلفيات في STV', 'screensaver-gallery': 'معرض شاشات التوقف في STV', 'fonts': 'اختيار الخط العربي في STV',
      'logo-gallery': 'معرض شعارات STV' }
  };

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
  var EN = {};
  nodes.forEach(function (n) { EN[n.getAttribute('data-i18n')] = n.textContent; });
  var lang = root.lang === 'ar' ? 'ar' : 'en';

  function shotOf(img) { var m = /img\/([\w-]+)\.webp/.exec(img.getAttribute('src') || ''); return m ? m[1] : 'home'; }

  function apply(l) {
    lang = l;
    root.lang = l; root.dir = l === 'ar' ? 'rtl' : 'ltr';
    nodes.forEach(function (n) {
      var k = n.getAttribute('data-i18n');
      var v = l === 'ar' ? AR[k] : EN[k];
      if (v != null) n.textContent = v;
    });
    document.querySelectorAll('img[data-i18n-alt]').forEach(function (img) { img.alt = ALT[l][shotOf(img)] || img.alt; });
    var label = document.getElementById('langLabel');
    label.textContent = l === 'ar' ? 'English' : 'العربية';
    label.lang = l === 'ar' ? 'en' : 'ar';
    document.getElementById('langToggle').setAttribute('aria-label', l === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    document.title = l === 'ar' ? 'STV · تلفزيونك. مساحتك.' : 'STV · Your TV. Your Space.';
    try { localStorage.setItem('stv-language', l); } catch (e) {}
  }

  document.getElementById('langToggle').addEventListener('click', function () { apply(lang === 'ar' ? 'en' : 'ar'); });

  /* screenshot tabs */
  function tabs(selector, attr, imgId) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll(selector));
    var img = document.getElementById(imgId);
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        var name = b.getAttribute(attr);
        var next = new Image();
        next.onload = function () {
          img.classList.add('swap');
          setTimeout(function () { img.src = next.src; img.alt = ALT[lang][name] || ''; img.classList.remove('swap'); }, 180);
        };
        next.src = 'assets/img/' + name + '.webp';
      });
      b.addEventListener('keydown', function (e) {
        var i = buttons.indexOf(b), d = 0;
        var fwd = root.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', back = root.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === fwd || e.key === 'ArrowDown') d = 1; else if (e.key === back || e.key === 'ArrowUp') d = -1; else return;
        e.preventDefault();
        var t = buttons[(i + d + buttons.length) % buttons.length]; t.focus(); t.click();
      });
    });
  }
  tabs('[data-shot]', 'data-shot', 'showcaseImg');
  tabs('[data-cust]', 'data-cust', 'customImg');

  /* nav border after scrolling */
  var nav = document.querySelector('.nav');
  window.addEventListener('scroll', function () { nav.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });

  /* gentle reveal */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.section-head, .card, .tv:not(.hero-shot), .video, .download-card, .faq details, .support-card');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (t) { t.classList.add('reveal'); io.observe(t); });
  }

  apply(lang);
})();
