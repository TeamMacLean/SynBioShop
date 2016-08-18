var placeholder = document.createElement("li");
placeholder.className = "placeholder";

var List = React.createClass({
    getInitialState: function () {
        return {subjects: this.props.subjects};
    },
    dragStart: function (e) {
        this.dragged = e.currentTarget;
        e.dataTransfer.effectAllowed = 'move';
        // Firefox requires dataTransfer data to be set
        e.dataTransfer.setData("text/html", e.currentTarget);
    },
    dragOver: function (e) {
        e.preventDefault();
//            this.dragged.style.display = "none";
        if (e.target.className == "placeholder") return;
        this.over = e.target;
        var relY = e.clientY - this.over.offsetTop;
        var height = this.over.offsetHeight / 2;
        var parent = e.target.parentNode;

        if (relY > height) {
            this.nodePlacement = "after";
            parent.insertBefore(placeholder, e.target.nextElementSibling);
        }
        else if (relY < height) {
            this.nodePlacement = "before"
            parent.insertBefore(placeholder, e.target);
        }
    },
    render: function () {
        return <div>
            {this.state.subjects.map(function (item, i) {
                return (
                    <Subject
                        data-id={i}
                        key={item.id}
                        subjects={item.subjects}
                        documents={item.documents}
                        name={item.name}
                        draggable="true"
                        dragStart={this.dragStart}
                        dragOver={this.dragOver}
                    />
                )
            }, this)}
        </div>
    }
});

var Subject = React.createClass({
    getInitialState: function () {
        return {documents: this.props.documents, subjects: this.props.subjects};
    },
    dragEnd: function (d) {
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder)
        }

        console.log(d);
    },
    render: function () {
        return (
            <div
                className="dragg"
                draggable="true"
                onDragStart={this.props.dragStart}
                onDragOver={this.props.dragOver}
                onDragEnd={this.dragEnd}
            >

                <h2>{this.props.name} - {this.props['data-id']}</h2>
                {this.state.documents ? this.state.documents.map(function (item, i) {
                    return (
                        <li data-id={i}
                            key={item.id}
                            name={item.name}
                            draggable="false"
                        >
                            {item.name} - {i}
                        </li>
                    )
                }, this) : null}
                {this.state.subjects ? this.state.subjects.map(function (item, i) {
                    return (
                        <Subject
                            data-id={i}
                            name={item.name}
                            key={item.id}
                            subjects={item.subjects}
                            documents={item.documents}
                            dragStart={this.props.dragStart}
                            dragOver={this.props.dragOver}
                        />
                    )
                }, this) : null}
            </div>
        )
    }
})
ReactDOM.render(
    <List subjects={subjects}/>, document.getElementById('app')
);