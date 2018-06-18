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

var Subject = React.createClass({
    getInitialState: function () {
        return {
            subjects: this.props.subjects ? this.props.subjects.sort(function (a, b) {
                return a.position - b.position
            }) : [],
            documents: this.props.documents ? this.props.documents.sort(function (a, b) {
                return a.position - b.position
            }) : [],
        };
    },
    onReorder: function (amount) {
        this.props.move(this.props.index, amount);
    },
    moveDocument: function (index, amount) {
        var mod = this.state.documents;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({documents: mod})
        }
    },
    moveSubject: function (index, amount) {
        var mod = this.state.subjects;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({subjects: mod})
        }
    },
    render: function () {
        return (
            <div className="subject">
                <h2>{this.props.name} <ReorderButtons action={this.onReorder}/>
                </h2>
                <div className="indent">
                    <div data-id={this.props.id}>
                        {
                            this.state.documents
                                .map(function (item, i) {
                                    return (
                                        <Document
                                            id={item.id}
                                            name={item.name}
                                            key={item.id}
                                            index={i}
                                            move={this.moveDocument}
                                        />
                                    )
                                }, this)
                        }

                        {
                            this.state.subjects
                                .map(function (item, i) {
                                    return (
                                        <Subject
                                            id={item.id}
                                            name={item.name}
                                            subjects={item.subjects}
                                            documents={item.documents}
                                            key={item.id}
                                            isRoot={false}
                                            index={i}
                                            move={this.moveSubject}
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

var Document = React.createClass({
    onReorder: function (amount) {
        this.props.move(this.props.index, amount);
    },
    render: function () {
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
            subjects: this.props.subjects.sort(function (a, b) {
                return a.position - b.position
            })
        };
    },
    save: function () {

        var POST_URL = '/docs/rearrange';

        console.log(this.state.subjects);

        var dataJSON = JSON.stringify(this.state.subjects);
//
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
        var mod = this.state.subjects;
        if (index + amount < mod.length && index + amount > -1) {
            mod.move(index, index + amount);
            updatePositions(mod);
            this.setState({subjects: mod});
        }
    },
    render: function () {
        var self = this;
        return (
            <div className="simon-list">
                {
                    this.state.subjects
                        .map(function (item, i) {
                            return (
                                <Subject
                                    id={item.id}
                                    name={item.name}
                                    subjects={item.subjects}
                                    documents={item.documents}
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



console.log('init data', subjects);
ReactDOM.render(
    <App subjects={subjects}/>, document.getElementById('app')
);
