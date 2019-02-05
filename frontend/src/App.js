import React, { Component } from 'react';
import {BarChart} from 'react-d3-components';
import './App.css';

const data = [{
    label: 'somethingA',
    values: [{x: 'SomethingA', y: 10}, {x: 'SomethingB', y: 4}, {x: 'SomethingC', y: 3}]
}];

class App extends Component {
  render() {
    return (
      <div className="App" style={{padding: '10%'}}>
         <BarChart
            data={data}
            width={400}
            height={400}
            margin={{top: 10, bottom: 50, left: 50, right: 10}}
        />
      </div>
    );
  }
}

export default App;
