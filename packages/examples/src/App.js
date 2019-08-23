import React, { useState } from 'react';
import * as ButtonModule from './Button';
import assign from 'object-assign';

const Button = ButtonModule.default;

const App = (props) => {
    const [count, setCount] = useState(0);
    const augmentedProps = assign({}, props, { foo: 'bar' });

    return (
        <div>
            <Button onClick={() => setCount(count - 1)}>-</Button>
            <strong>{count}</strong>
            <Button onClick={() => setCount(count + 1)} {...augmentedProps}>+</Button>
        </div>
    );
};

export default App;
