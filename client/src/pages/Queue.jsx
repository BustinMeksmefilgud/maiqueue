import { useState, useEffect } from 'react'
import { Link } from "react-router-dom";

export default function Home({ user }) {

    const [queueData, setQueueData] = useState([])

    const fetchQueueData = async () => {
        const response = [{
            player1: "Hiura",
            player2: "Spark!"
        },
        {
            player1: "Zach",
            player2: "Bustin"
        }
        
        ]

        setQueueData(response)
    }

    useEffect(() => {
        fetchQueueData()
    }, []);

    const queueList = queueData.map((q) => (
        <tr>
            <td>{q.player1}</td>
            <td>{q.player2}</td>
        </tr>
    ));
    return (
        <div className="p-10 max-w-md">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">MaiQueue Board</h1>
            </div>

        <div className="grid grid-cols-1 gap-4 w-500">
            <div className="card bg-base-300 shadow-xl border justify-center">
                <table className="table ps-12 mb-12 text-white">
                            <thead className="text-center bg-teal-900 text-white">
                                <tr className="">
                                    <th>Player 1</th>
                                    <th>Player 2</th>
                                </tr>
                            </thead>
                            <tbody className="text-center bg-teal-700">
                            {queueList}     
                            </tbody> 
                </table>
            </div>
            </div>
            <button 
                  className="btn btn-sm btn-primary btn-outline mt-5 text-white hover:bg-red-500/20"
                >
                  Join Waiting List
            </button>
        </div>
    );
}