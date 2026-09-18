import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Home } from './screens/Home.js';
import { Room } from './screens/Room.js';
import { Table } from './screens/Table.js';

export function App(): JSX.Element {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="/room/:code/play" element={<Table />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
