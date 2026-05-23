/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import type { TaskSessionAssignment } from './taskSessionLinking';

export type TaskSessionLinkContextValue = {
    assignments: Map<string, TaskSessionAssignment>;
    isLoading: boolean;
    hasFetched: boolean;
};

const EMPTY_ASSIGNMENTS = new Map<string, TaskSessionAssignment>();

const TaskSessionLinkContext = React.createContext<TaskSessionLinkContextValue>({
    assignments: EMPTY_ASSIGNMENTS,
    isLoading: false,
    hasFetched: false,
});

export const TaskSessionLinkProvider: React.FC<{
    value: TaskSessionLinkContextValue;
    children: React.ReactNode;
}> = ({ value, children }) => {
    return (
        <TaskSessionLinkContext.Provider value={value}>
            {children}
        </TaskSessionLinkContext.Provider>
    );
};

export const useTaskSessionLinkContext = (): TaskSessionLinkContextValue => {
    return React.useContext(TaskSessionLinkContext);
};

export const useTaskSessionAssignment = (key: string | undefined): TaskSessionAssignment | undefined => {
    const { assignments } = useTaskSessionLinkContext();
    if (!key) {
        return undefined;
    }
    return assignments.get(key);
};
