const Billboard = require('../models/billboard');
const renderError = require('../lib/renderError');

const Admin = {
    billboard: {}
};

// Admin.index = ((req, res) => {
//     res.send('go to /admin/billboard')
// });

Admin.billboard.edit = ((req, res) => {

    Billboard.run()
        .then(billboards => {
            let billboard = billboards[0];

            return res.render('admin/billboard/edit', {billboard});

        })
        .catch((err) => {
            return renderError(err, res);
        })


});

Admin.billboard.editPost = ((req, res) => {

    console.log(req.body);

    const text = req.body.text;
    const enabled = req.body.enabled === 'on';

    Billboard.run()
        .then(billboards => {
            let billboard;
            if (billboards.length) {
                billboard = billboards[0];
            } else {
                billboard = new Billboard({});
            }

            if (text == null || text.length() == 0) {
                billboard.text = "";
            } else {
                billboard.text = text;
            }
            billboard.enabled = enabled;

            billboard.save()
                .then(savedBillboard => {
                    res.redirect('/');
                })
                .catch((err) => {
                    return renderError(err, res);
                })

        })
        .catch((err) => {
            return renderError(err, res);
        })


});

module.exports = Admin;