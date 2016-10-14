$(function () {
    initUserMenu();
    initFlashButtons();
    initAreYouSureButtons();
    initCartSocket();
});

function initUserMenu() {
    var user = $('.user');

    user.on('mouseenter', function () {
        $('.user-menu').removeClass('hidden');

    });
    user.on('mouseleave', function () {
        $('.user-menu').addClass('hidden');
    });
}

function initFlashButtons() {
    $('*[data-close="true"]').on('click', function () {
        var self = $(this).parent().parent();
        self.slideToggle('fast', function () {
            self.remove();
        });
    });
    $('.flash')
        .delay(5000).fadeOut();
}
function initAreYouSureButtons() {
    $('.areyousure').click(function () {
        return window.confirm('Are you sure?');
    });
}

function initCartSocket() {
    $('*[data-addToCart="true"]').on('click', function (e) {
        e.preventDefault();
        var typeID = $(this).attr('data-typeID');
        socket.emit('addToCart', {typeID: typeID, username: document.signedInUser.username});
        // flyToCart($(this));
    });

    socket.on('addedToCart', function (type) {
        var elForItemAdded = $('*[data-addToCart="true"][data-typeID="' + type.id + '"]');
        flyToCart(elForItemAdded);

    });

    socket.on('alreadyInCart', function (type) {
        // var cart = $('.nav-cart');
        // animate(cart, 'shake');

        var elForItemAdded = $('*[data-addToCart="true"][data-typeID="' + type.id + '"]');
        animateCSS(elForItemAdded, 'shake');
    });

    // socket.on('cartItemCount', function (amount) {
    //     var cart = $('.nav-cart');
    //     if (cart) {
    //         var count = cart.find('.count');
    //         count.text(amount);
    //     }
    //
    // })
}

function flyToCart(el) {
    var cart = $('.nav-cart');
    var clonedEl = el.clone();

    $(clonedEl).css({
        position: 'absolute',
        top: $(el).offset().top + "px",
        left: $(el).offset().left + "px",
        opacity: 1,
        'z-index': 1000
    });
    $('body').append($(clonedEl));

    var divider = 3;

    var gotoX = $(cart).offset().left + ($(cart).width() / 2) - ($(el).width() / divider) / 2;
    var gotoY = $(cart).offset().top + ($(cart).height() / 2) - ($(el).height() / divider) / 2;

    $(clonedEl)
        .addClass('hover')
        .animate({
                opacity: 0,
                left: gotoX,
                top: gotoY,
                width: $(el).width() / divider,
                height: $(el).height() / divider,
                fontSize: 0,
                lineHeight: 0

            }, 1000,
            function () {
                var count = cart.find('.count');
                count.text(parseInt(count.text()) + 1);
                $(clonedEl).remove();
                animateCSS(cart, 'rubberBand');

                // $(cart).fadeOut('fast', function () {
                //     $(cart).fadeIn('fast', function () {
                //         $(clonedEl).fadeOut('fast', function () {
                //             $(clonedEl).remove();
                //         });
                //     });
                // });
            });
}


function animateCSS(el, name, cb) {
    el.on("animationend webkitAnimationEnd oAnimationEnd MSAnimationEnd",
        function (e) {
            $(this).off(e);
            $(this).removeClass(name + ' animated');
            if (cb) {
                cb();
            }
        });

    el.addClass(name + ' animated');
}