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
    var cart = $('.nav-cart');
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
        var elForItemAdded = $('*[data-addToCart="true"][data-typeID="' + type.id + '"]');
        animateCSS(elForItemAdded, 'shake');
    });


    // on cart page

    $('input[type="checkbox"][data-quantity="true"]').on('click', function (e) {
        e.preventDefault();

        socket.emit('changeQuantity', {
            id: $(this).data('id')
        });
    });
    socket.on('quantityUpdated', function (data) {
        $('input[type="checkbox"][data-quantity="true"][data-id="' + data.id + '"]').prop("checked", data.large);
    });


    $('a.remove-from-cart').on('click', function (e) {
        e.preventDefault();
        socket.emit('removeFromCart', {
            id: $(this).data('id')
        })
    });
    socket.on('removedFromCart', function (data) {
        $('tr[data-id="' + data.id + '"]')
            .fadeOut(500, function () {
                $(this).remove();
                var count = cart.find('.count');

                var newCount = parseInt(count.text()) - 1;

                count.text(newCount);

                if (newCount < 1) {
                    location.reload();
                }

            });
    });
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


                //make button tick'd
                $(el).find('span')
                    .attr('data-icon', 'N');

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