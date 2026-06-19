export interface Failure<ERR> {
    success: false;
    data: ERR;
}