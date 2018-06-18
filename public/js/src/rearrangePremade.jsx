import $ from 'jquery'
const React = require('react');
const ReactDOM = require('react-dom');

Array.prototype.move = function (old_index, new_index) {
    if (new_index >= this.length) {
        var k = new_index - this.length;
        while ((k--) + 1) {
            this.push(undefined);
        }
    }
    this.splice(new_index, 0, this.splice(old_index, 1)[0]);
    return this;
};

function updatePositions(array) {
    return array.map(function (a, i) {
        return a.position = i;
    })
}

var ReorderButtons = React.createClass({
    onClick: function (amount) {
        this.props.action(amount);
    },
    render: function render() {
        return (
            <div className="inline">
                <button className="inline small" onClick={this.onClick.bind(this, -1)}><span
                    data-icon="&#x32;"/>
                </button>
                <button className="inline small" onClick={this.onClick.bind(this, 1)}><span
                    data-icon="&#x33;"/>
                </button>
            </div>
        )

    }
});

var DB = React.createClass({
    getInitialState: function () {
        return {
            dbs: this.props.dbs ? this.props.dbs.sort(function (a, b) {
                return a.position - b.position
            }) : [],
            categories: this.props.categories ? this.props.categories.sort(function (a, b) {
                return a.position - b.position
            }) : []
        };
    },
    onReorder: function (amount) {
        this.props.move(this.props.index, amount);
    },
    moveCategory: function (index, amount) {
        var mod = this.state.categories;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({categories: mod})
        }
    },
    render: function () {
        return (
            <div className="db">
                <h2>{this.props.name} <ReorderButtons action={this.onReorder}/>
                </h2>
                <div className="indent">
                    <div data-id={this.props.id}>
                        {
                            this.state.categories
                                .map(function (item, i) {
                                    return (
                                        <Category
                                            id={item.id}
                                            name={item.name}
                                            key={item.id}
                                            index={i}
                                            move={this.moveCategory}
                                            items={item.items}
                                        />
                                    )
                                }, this)
                        }
                    </div>
                </div>
            </div>
        )
    }
})

var Category = React.createClass({
    onReorder: function (amount) {
        this.props.move(this.props.index, amount);
    },
    moveItem: function (index, amount) {
        var mod = this.state.items;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({items: mod})
        }
    },
    getInitialState: function () {
        return {
            items: this.props.items ? this.props.items.sort(function (a, b) {
                return a.position - b.position
            }) : []
        };
    },
    render: function () {
        return (
            <div className="indent">
                <div data-id={this.props.id}>
                    {this.props.name} <ReorderButtons action={this.onReorder}/>
                </div>
                <div className="indent">
                    <div data-id={this.props.id}>
                        {
                            this.state.items
                                .map(function (item, i) {
                                    return (
                                        <Item
                                            id={item.id}
                                            name={item.name}
                                            key={item.id}
                                            index={i}
                                            move={this.moveItem}
                                        />
                                    )
                                }, this)
                        }
                    </div>
                </div>
            </div>
        )
    },
})

var Item = React.createClass({
    onReorder: function (amount) {
        this.props.move(this.props.index, amount);
    },
    getInitialState: function () {
        return {
            items: this.props.items ? this.props.items.sort(function (a, b) {
                return a.position - b.position
            }) : []
        };
    },

    render: function () {
        // console.log(this.state);
        return (
            <div className="indent">
                <div data-id={this.props.id}>
                    {this.props.name} <ReorderButtons action={this.onReorder}/>
                </div>
            </div>

        )
    },
})

var App = React.createClass({
    getInitialState: function () {
        return {
            dbs: this.props.dbs.sort(function (a, b) {
                return a.position - b.position
            })
        };
    },
    save: function () {

        var POST_URL = '/premade/rearrange';

        var dataJSON = JSON.stringify(this.state.dbs);

        $.post(POST_URL, {newOrder: dataJSON})
            .done(function () {
                location.reload();
            })
            .fail(function (resData) {
                console.error("error", resData);
                alert(resData);
            })


    },
    move: function (index, amount) {
        var mod = this.state.dbs;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({dbs: mod});
        }
    },
    render: function () {
        var self = this;
        return (
            <div className="simon-list">
                {
                    this.state.dbs
                        .map(function (item, i) {
                            return (
                                <DB
                                    id={item.id}
                                    name={item.name}
                                    dbs={item.dbs}
                                    categories={item.categories}
                                    key={item.id}
                                    index={i}
                                    isRoot={true}
                                    move={this.move}
                                />
                            )
                        }, this)
                }
                <hr/>
                <button className="button primary" onClick={self.save}>Save Arrangement</button>
            </div>
        )
    }
})



//    console.log('init data', dbs);
ReactDOM.render(
    <App dbs={dbs}/>, document.getElementById('app')
);
