$(function () {
    initUserMenu();
    initFlashButtons();
    initAreYouSureButtons();
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
}
function initAreYouSureButtons() {
    $('.areyousure').click(function () {
        return window.confirm('Are you sure?');
    });
}

//$(function () {
//
//  $('#addDBButton').on('click', function () {
//    var text = $('#addDB').val();
//
//    if (text.length > 0) {
//      socket.emit('addDB', text);
//    } else {
//      animate($('#addDBButton'), 'shake');
//    }
//
//  });
//
//  socket.on('addedDB', function (addedDB) {
//    $('#dbList').prepend('<li>' + addedDB.name + '</li>');
//  })
//
//});

function animate(el, name) {
    el.on(
        'transitionend MSTransitionEnd webkitTransitionEnd oTransitionEnd',
        function () {
            $(this).removeClass(name + ' animated');
        }
    );
    el.addClass(name + ' animated');

}