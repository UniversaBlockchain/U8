/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {KeyAddress, PublicKey, HashId} from 'crypto'

const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const roles = require('roles');
const t = require("tools");
const Boss = require('boss.js');
const e = require("errors");
const BigDecimal  = require("big").Big;

const ex = require("exceptions");

//Operators
const operators = [" defined"," undefined","<=",">=","<",">","!=","=="," matches "," is_a "," is_inherit ","inherits ",
    "inherit "," can_play ", " in "];

const DEFINED = 0;
const UNDEFINED = 1;
const LESS_OR_EQUAL = 2;
const MORE_OR_EQUAL = 3;
const LESS = 4;
const MORE = 5;
const NOT_EQUAL = 6;
const EQUAL = 7;
const MATCHES = 8;
const IS_A = 9;
const IS_INHERIT = 10;
const INHERITS = 11;
const INHERIT = 12;
const CAN_PLAY = 13;
const IN = 14;

//Operations
const operations = ["+", "-", "*", "/"];
const roundOperations = ["round(", "floor(", "ceil("];

const PLUS = 0;
const MINUS = 1;
const MULT = 2;
const DIV = 3;

const ROUND_OPERATIONS = 100;
const ROUND = 100;
const FLOOR = 101;
const CEIL = 102;

//Conversions
const NO_CONVERSION = 0;
const CONVERSION_BIG_DECIMAL = 1;

/**
 * Comparison operand type.
 *
 * @readonly
 * @enum {number}
 */
const compareOperandType = {
    FIELD : 0,
    CONSTSTR  : 1,
    CONSTOTHER : 2,
    EXPRESSION : 3
};


class Constraint extends bs.BiSerializable {
    static TYPE_TRANSACTIONAL = 1;
    static TYPE_EXISTING_DEFINITION = 2;
    static TYPE_EXISTING_STATE = 3;

    static conditionsModeType = {
        all_of : "all_of",
        any_of : "any_of",
        simple_condition : "simple_condition"
    };

    /**
     * Constraint constructor function.
     *
     * @class
     * @param {Contract} contract - Contract containing constraint.
     *
     * @classdesc Constraints allow you to refer to the internal fields of the contract, constants and fields of other
     * contracts, to establish the necessary conditions.
     */
    constructor(contract) {
        super();
        this.baseContract = contract;
        this.name = "";
        this.type = Constraint.TYPE_EXISTING_DEFINITION;
        this.transactional_id = "";
        this.contract_id = null;
        this.required = true;
        this.origin = null;
        this.signed_by = [];
        this.fields = [];
        this.roles = [];
        this.matchingItems = new t.GenericSet();
        this.conditions = {};
        this.comment = null;
    }

    async deserialize(data, deserializer) {

        if(data.hasOwnProperty("name"))
            this.name = data.name;
        else
            this.name = null;

        if(data.hasOwnProperty("type"))
            this.type = data.type;
        else
            this.type = null;

        if(data.hasOwnProperty("comment"))
            this.comment = data.comment;
        else
            this.comment = null;

        if(data.hasOwnProperty("transactional_id"))
            this.transactional_id = data.transactional_id;
        else
            this.transactional_id = "";

        if(data.hasOwnProperty("contract_id") && data.contract_id != null)
            this.contract_id = await deserializer.deserialize(data.contract_id);
        else
            this.contract_id = null;

        if(data.hasOwnProperty("origin") && data.origin != null)
            this.origin = await deserializer.deserialize(data.origin);
        else
            this.origin = null;

        if(data.hasOwnProperty("signed_by") && data.signed_by != null)
            this.signed_by = await deserializer.deserialize(data.signed_by);
        else
            this.signed_by = [];

        if(data.hasOwnProperty("roles") && data.roles != null)
            this.roles = await deserializer.deserialize(data.roles);
        else
            this.roles = [];

        if(data.hasOwnProperty("fields") && data.fields != null)
            this.fields = await deserializer.deserialize(data.fields);
        else
            this.fields = [];

        if(data.hasOwnProperty("where") && data.where != null)
            this.conditions = await deserializer.deserialize(data.where);
        else
            this.conditions = {};
    }

    async serialize(serializer) {

        let data = {
            name : this.name,
            type : this.type,
            transactional_id : this.transactional_id,
            required : this.required,
            signed_by : this.signed_by,
            roles : this.roles,
            fields : this.fields,
            where : this.conditions
        };

        if (this.contract_id != null)
            data.contract_id = this.contract_id;

        if (this.origin != null)
            data.origin = this.origin;

        if (this.comment != null)
            data.comment = this.comment;

        return await serializer.serialize(data);
    }

    async copy() {
        let bbm = BossBiMapper.getInstance();

        return await bbm.deserialize(await bbm.serialize(this));
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.type, to.type))
            return false;

        return this.equalsIgnoreType(to);
    }

    equalsIgnoreType(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.name, to.name))
            return false;

        if(!t.valuesEqual(this.comment, to.comment))
            return false;

        if(!t.valuesEqual(this.transactional_id, to.transactional_id))
            return false;

        if(!t.valuesEqual(this.required, to.required))
            return false;

        if(!t.valuesEqual(this.signed_by, to.signed_by))
            return false;

        if(!t.valuesEqual(this.roles, to.roles))
            return false;

        if(!t.valuesEqual(this.fields, to.fields))
            return false;

        if(!t.valuesEqual(this.conditions, to.conditions))
            return false;

        if(!t.valuesEqual(this.contract_id, to.contract_id))
            return false;

        if(!t.valuesEqual(this.origin, to.origin))
            return false;

        return true;
    }

    setConditions(conditions) {
        this.conditions = this.parseConditions(conditions);
    }

    exportConditions() {
        return this.assemblyConditions(this.conditions);
    }

    setContract(contract) {
        this.baseContract = contract;
    }

    static objectCastToTimeSeconds(obj, operand, typeOfOperand) {
        let val;
        if ((obj == null) && (typeOfOperand === compareOperandType.FIELD))
            throw new ex.IllegalArgumentError("Error getting operand: " + operand);
        if ((obj != null) && obj instanceof Date)
            val = Math.floor(obj.getTime() / 1000);
        else if ((obj != null) && (typeof obj === "string"))
            val = Math.floor(Date.parse(obj) / 1000);
        else if ((obj != null) && (typeof obj === "number"))
            val = obj;
        else if (typeOfOperand === compareOperandType.CONSTSTR)
            val = Math.floor(Date.parse(operand) / 1000);
        else if (typeOfOperand === compareOperandType.CONSTOTHER)
            val = parseInt(operand, 10);
        else
            throw new ex.IllegalArgumentError("Error parsing DateTime from operand: " + operand);

        return val;
    }

    static objectCastToBigDecimal(obj, operand, typeOfOperand) {
        let val;
        if ((obj == null) && (typeOfOperand === compareOperandType.FIELD))
            throw new ex.IllegalArgumentError("Error getting operand: " + operand);

        if ((obj != null) && obj instanceof BigDecimal)
            return obj;

        if ((obj != null) && ((typeof obj === "string") || (typeof obj === "number")))
            val = new BigDecimal(obj);
        else if ((obj != null) && obj instanceof Date)
            val = new BigDecimal(Math.floor(obj.getTime() / 1000));
        else if ((typeOfOperand === compareOperandType.CONSTSTR) || (typeOfOperand === compareOperandType.CONSTOTHER))
            val = new BigDecimal(operand);
        else
            throw new ex.IllegalArgumentError("Error parsing BigDecimal from operand: " + operand);

        return val;
    }

    evaluateOperand(operand, typeOfOperand, conversion, refContract, contracts, iteration) {
        let operandContract = null;
        let firstPointPos;

        if (operand == null)
            throw new ex.IllegalArgumentError("Error evaluate null operand");

        if (typeOfOperand === compareOperandType.FIELD) {
            if (operand.startsWith("ref.")) {
                operand = operand.substring(4);
                operandContract = refContract;
            } else if (operand.startsWith("this.")) {
                if (this.baseContract == null)
                    throw new ex.IllegalArgumentError("Use left operand in expression: " + operand + ". But this contract not initialized.");

                operand = operand.substring(5);
                operandContract = this.baseContract;
            } else if ((firstPointPos = operand.indexOf(".")) > 0) {
                if (this.baseContract == null)
                    throw new ex.IllegalArgumentError("Use left operand in expression: " + operand + ". But this contract not initialized.");

                let ref = this.baseContract.findConstraintByName(operand.substring(0, firstPointPos));
                if (ref == null)
                    throw new ex.IllegalArgumentError("Not found reference: " + operand.substring(0, firstPointPos));

                for (let checkedContract of contracts)
                    if (ref.isMatchingWithIteration(checkedContract, contracts, iteration + 1))
                        operandContract = checkedContract;

                if (operandContract == null)
                    throw new ex.IllegalArgumentError("Not found referenced contract for constraint: " + operand.substring(0, firstPointPos));

                operand = operand.substring(firstPointPos + 1);
            } else
                throw new ex.IllegalArgumentError("Invalid format of left operand in expression: " + operand + ". Missing contract field.");

                return operandContract.get(operand);
        } else {
            if (conversion === CONVERSION_BIG_DECIMAL || operand.length > 7)   // > 7 symbols => operand * operand > number precision. Use BigDecimal.
                return new BigDecimal(operand);
            else if (operand.includes("."))
                return parseFloat(operand);
            else
                return parseInt(operand);
        }
    }

    evaluateExpression(expression, refContract, contracts, iteration) {
        let left;
        let right;
        let result;

        try {
            // evaluate operands
            if (expression.typeOfLeftOperand === compareOperandType.EXPRESSION)
                left = this.evaluateExpression(expression.leftOperand, refContract, contracts, iteration);
            else
                left = this.evaluateOperand(expression.leftOperand, expression.typeOfLeftOperand,
                    expression.leftConversion, refContract, contracts, iteration);

            if (expression.typeOfRightOperand === compareOperandType.EXPRESSION)
                right = this.evaluateExpression(expression.rightOperand, refContract, contracts, iteration);
            else
                right = this.evaluateOperand(expression.rightOperand, expression.typeOfRightOperand,
                    expression.rightConversion, refContract, contracts, iteration);

            if (left == null || right == null)
                return null;

            // evaluate expression

            if (expression.operation === ROUND)
                result = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD).round(
                    Number(right), 1);// 1 - ROUND_HALF_UP
            else if (expression.operation === FLOOR || expression.operation === CEIL) {
                let value = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD);

                if ((expression.operation === FLOOR && value.cmp(0) !== -1) || (expression.operation === CEIL && value.cmp(0) === -1))
                    result = value.round(Number(right), 0);// 0 - ROUND_DOWN
                else if ((expression.operation === CEIL && value.cmp(0) !== -1) || (expression.operation === FLOOR && value.cmp(0) === -1))
                    result = value.round(Number(right), 3); // 3 - ROUND_UP
            }
            else if (expression.leftConversion === CONVERSION_BIG_DECIMAL || expression.rightConversion === CONVERSION_BIG_DECIMAL ||
                left instanceof BigDecimal || right instanceof BigDecimal) {
                // BigDecimals
                if (expression.operation === PLUS)
                    result = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD).add(
                        Constraint.objectCastToBigDecimal(right, null, compareOperandType.FIELD));
                else if (expression.operation === MINUS)
                    result = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD).sub(
                        Constraint.objectCastToBigDecimal(right, null, compareOperandType.FIELD));
                else if (expression.operation === MULT)
                    result = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD).mul(
                        Constraint.objectCastToBigDecimal(right, null, compareOperandType.FIELD));
                else if (expression.operation === DIV)
                    result = Constraint.objectCastToBigDecimal(left, null, compareOperandType.FIELD).div(
                        Constraint.objectCastToBigDecimal(right, null, compareOperandType.FIELD));
                else
                    throw new ex.IllegalArgumentError("Unknown operation: " + expression.operation);

            } else if (typeof left === "number" && typeof right === "number") {
                // Numbers
                if (expression.operation === PLUS)
                    result = left + right;
                else if (expression.operation === MINUS)
                    result = left - right;
                else if (expression.operation === MULT)
                    result = left * right;
                else if (expression.operation === DIV)
                    result = left / right;
                else
                    throw new ex.IllegalArgumentError("Unknown operation: " + expression.operation);

            } else
                throw new ex.IllegalArgumentError("Incompatible operand types. Left: " + typeof left + ". Right: " + typeof right);
        } catch (e) {
            throw new ex.IllegalArgumentError("Error evaluate expression: " + e.toString());
        }

        return result;
    }

    static prepareRoleToComparison(item) {
        if (item instanceof roles.RoleLink && item.requiredAllConstraints.size === 0 && item.requiredAnyConstraints.size === 0)
            return item.resolve();
        else if (typeof item === "string") {
            try {
                let roleString = item.replace(/\s/g, "");       // for key in quotes

                if (roleString.length > 72) {
                    // Key
                    let publicKey = new PublicKey(atob(roleString));
                    return new roles.SimpleRole("roleToComparison", [publicKey]);
                } else {
                    // Address
                    let ka = new KeyAddress(roleString);
                    return new roles.SimpleRole("roleToComparison", [ka]);
                }
            }
            catch (e) {
                throw new ex.IllegalArgumentError("Key or address compare error in condition: " + e.toString());
            }
        } else
            return item;
    }

    /**
     * The comparison method for finding constraint contract.
     *
     * @param {Contract} refContract - Contract to check for matching.
     * @param {string} leftOperand - Left operand field selector.
     * @param {string} rightOperand - Right operand (constant | field_selector), constant = ("null" | number | string | true | false).
     * @param {compareOperandType} typeOfLeftOperand - Type of left operand (constant | field_selector), constant = ("null" | number | string | true | false).
     * @param {compareOperandType} typeOfRightOperand - Type of right operand (constant | field_selector), constant = ("null" | number | string | true | false).
     * @param {boolean} isBigDecimalConversion - If true, converts strings and numbers to BigDecimal before comparison.
     * @param {number} indxOperator - Index operator in array of operators.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Check inside constraints iteration number
     * @return {boolean} True if match or false.
     * @throws If error compare.
     */
    compareOperands(refContract,
                    leftOperand,
                    rightOperand,
                    typeOfLeftOperand,
                    typeOfRightOperand,
                    isBigDecimalConversion,
                    indxOperator,
                    contracts,
                    iteration) {

        let ret = false;
        let leftOperandContract = null;
        let rightOperandContract = null;
        let left = null;
        let right = null;
        let leftExpression = null;
        let rightExpression = null;
        let firstPointPos;

        if (leftOperand != null && typeof leftOperand === "object") {
            leftExpression = leftOperand;
            leftOperand = undefined;
        }
        if (rightOperand != null && typeof rightOperand === "object") {
            rightExpression = rightOperand;
            rightOperand = undefined;
        }

        // get operands
        if (leftOperand != null) {
            if (typeOfLeftOperand === compareOperandType.FIELD) {
                if (leftOperand.startsWith("ref.")) {
                    leftOperand = leftOperand.substring(4);
                    leftOperandContract = refContract;
                } else if (leftOperand.startsWith("this.")) {
                    if (this.baseContract == null)
                        throw new ex.IllegalArgumentError("Use left operand in condition: " + leftOperand + ". But this contract not initialized.");

                    leftOperand = leftOperand.substring(5);
                    leftOperandContract = this.baseContract;
                } else if ((firstPointPos = leftOperand.indexOf(".")) > 0) {
                    if (this.baseContract == null)
                        throw new ex.IllegalArgumentError("Use left operand in condition: " + leftOperand + ". But this contract not initialized.");

                    let ref = this.baseContract.findConstraintByName(leftOperand.substring(0, firstPointPos));
                    if (ref == null)
                        throw new ex.IllegalArgumentError("Not found constraint: " + leftOperand.substring(0, firstPointPos));
                    for (let checkedContract of contracts)
                        if (ref.isMatchingWithIteration(checkedContract, contracts, iteration + 1))
                            leftOperandContract = checkedContract;

                    if (leftOperandContract == null)
                        return false;
                        //throw new ex.IllegalArgumentError("Not found referenced contract for constraint: " + leftOperand.substring(0, firstPointPos));

                    leftOperand = leftOperand.substring(firstPointPos + 1);
                } else
                    throw new ex.IllegalArgumentError("Invalid format of left operand in condition: " + leftOperand + ". Missing contract field.");

            } else if (typeOfLeftOperand === compareOperandType.CONSTOTHER) {
                if (indxOperator === CAN_PLAY) {
                    if (leftOperand === "ref") {
                        leftOperandContract = refContract;
                    } else if (leftOperand === "this") {
                        if (this.baseContract == null)
                            throw new ex.IllegalArgumentError("Use left operand in condition: " + leftOperand + ". But this contract not initialized.");

                        leftOperandContract = this.baseContract;
                    } else {
                        if (this.baseContract == null)
                            throw new ex.IllegalArgumentError("Use left operand in condition: " + leftOperand + ". But this contract not initialized.");

                        let ref = this.baseContract.findConstraintByName(leftOperand);
                        if (ref == null)
                            throw new ex.IllegalArgumentError("Not found constraint: " + leftOperand);

                        for (let checkedContract of contracts)
                            if (ref.isMatchingWithIteration(checkedContract, contracts, iteration + 1))
                                leftOperandContract = checkedContract;

                        if (leftOperandContract == null)
                            return false;
                            //throw new ex.IllegalArgumentError("Not found referenced contract for constraint: " + leftOperand);
                    }
                } else if (leftOperand === "now")
                    left = new Date();
            }
        }

        if (rightOperand != null) {     // if != null, rightOperand then FIELD or CONSTANT
            if (typeOfRightOperand === compareOperandType.FIELD) {     // if typeOfRightOperand - FIELD
                if (rightOperand.startsWith("ref.")) {
                    rightOperand = rightOperand.substring(4);
                    rightOperandContract = refContract;
                } else if (rightOperand.startsWith("this.")) {
                    if (this.baseContract == null)
                        throw new ex.IllegalArgumentError("Use right operand in condition: " + rightOperand + ". But this contract not initialized.");

                    rightOperand = rightOperand.substring(5);
                    rightOperandContract = this.baseContract;
                } else if ((firstPointPos = rightOperand.indexOf(".")) > 0) {
                    if (this.baseContract == null)
                        throw new ex.IllegalArgumentError("Use right operand in condition: " + rightOperand + ". But this contract not initialized.");

                    let ref = this.baseContract.findConstraintByName(rightOperand.substring(0, firstPointPos));
                    if (ref == null)
                        throw new ex.IllegalArgumentError("Not found constraint: " + rightOperand.substring(0, firstPointPos));

                    for (let checkedContract of contracts)
                        if (ref.isMatchingWithIteration(checkedContract, contracts, iteration + 1))
                            rightOperandContract = checkedContract;

                    if (rightOperandContract == null)
                        return false;

                    rightOperand = rightOperand.substring(firstPointPos + 1);
                } else
                    throw new ex.IllegalArgumentError("Invalid format of right operand in condition: " + rightOperand + ". Missing contract field.");
            } else if (typeOfRightOperand === compareOperandType.CONSTOTHER) {
                if (rightOperand === "now")
                    right = new Date();
            }
        }

        // check operator
        if (rightOperand != null || rightExpression != null) {
            if ((leftOperandContract != null) && (indxOperator !== CAN_PLAY))
                left = leftOperandContract.get(leftOperand);
            if (rightOperandContract != null)
                right = rightOperandContract.get(rightOperand);

            if (leftExpression != null) {
                try {
                    left = this.evaluateExpression(leftExpression, refContract, contracts, iteration);
                } catch (e) {
                    if (e instanceof ex.IllegalArgumentError && ~e.toString().indexOf("Not found referenced contract for constraint"))
                        return false;
                    else
                        throw e;
                }

                typeOfLeftOperand = compareOperandType.FIELD;
                if (left instanceof BigDecimal)
                    isBigDecimalConversion = true;
            }

            if (rightExpression != null) {
                try {
                    right = this.evaluateExpression(rightExpression, refContract, contracts, iteration);
                } catch (e) {
                    if (e instanceof ex.IllegalArgumentError && ~e.toString().indexOf("Not found referenced contract for constraint"))
                        return false;
                    else
                        throw e;
                }

                typeOfRightOperand = compareOperandType.FIELD;
                if (right instanceof BigDecimal)
                    isBigDecimalConversion = true;
            }

            try {
                switch (indxOperator) {
                    case LESS:
                    case MORE:
                    case LESS_OR_EQUAL:
                    case MORE_OR_EQUAL:
                        if (typeOfLeftOperand === compareOperandType.FIELD && left == null)
                            break;

                        if (typeOfRightOperand === compareOperandType.FIELD && right == null)
                            break;

                        if (isBigDecimalConversion) {
                            let leftBigDecimal = Constraint.objectCastToBigDecimal(left, leftOperand, typeOfLeftOperand);
                            let rightBigDecimal = Constraint.objectCastToBigDecimal(right, rightOperand, typeOfRightOperand);

                            if (((indxOperator === LESS) && (leftBigDecimal.cmp(rightBigDecimal) === -1)) ||
                                ((indxOperator === MORE) && (leftBigDecimal.cmp(rightBigDecimal) === 1)) ||
                                ((indxOperator === LESS_OR_EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) < 1)) ||
                                ((indxOperator === MORE_OR_EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) > -1)))
                                ret = true;

                        } else if (((left != null) && left instanceof Date) ||
                            ((right != null) && right instanceof Date)) {
                            let leftTime = Constraint.objectCastToTimeSeconds(left, leftOperand, typeOfLeftOperand);
                            let rightTime = Constraint.objectCastToTimeSeconds(right, rightOperand, typeOfRightOperand);

                            if (((indxOperator === LESS) && (leftTime < rightTime)) ||
                                ((indxOperator === MORE) && (leftTime > rightTime)) ||
                                ((indxOperator === LESS_OR_EQUAL) && (leftTime <= rightTime)) ||
                                ((indxOperator === MORE_OR_EQUAL) && (leftTime >= rightTime)))
                                ret = true;

                        } else {
                            let leftVal = 0;
                            let rightVal = 0;

                            if (typeOfLeftOperand === compareOperandType.FIELD)
                                leftVal = left;
                            else if ((typeOfLeftOperand === compareOperandType.CONSTOTHER) &&
                                (leftOperand !== "null") && (leftOperand !== "false") && (leftOperand !== "true"))
                                leftVal = parseFloat(leftOperand);
                            else
                                throw new ex.IllegalArgumentError("Invalid left operator in condition for string: " + operators[indxOperator]);

                            if (typeOfRightOperand === compareOperandType.FIELD)
                                rightVal = right;
                            else if ((typeOfRightOperand === compareOperandType.CONSTOTHER) &&
                                (rightOperand !== "null") && (rightOperand !== "false") && (rightOperand !== "true"))
                                rightVal = parseFloat(rightOperand);
                            else
                                throw new ex.IllegalArgumentError("Invalid right operator in condition for string: " + operators[indxOperator]);

                            if ((leftVal != null) && (rightVal != null)) {
                                if (((indxOperator === LESS) && (leftVal < rightVal)) ||
                                    ((indxOperator === MORE) && (leftVal > rightVal)) ||
                                    ((indxOperator === LESS_OR_EQUAL) && (leftVal <= rightVal)) ||
                                    ((indxOperator === MORE_OR_EQUAL) && (leftVal >= rightVal)))
                                    ret = true;
                            }
                        }

                        break;

                    case NOT_EQUAL:
                    case EQUAL:
                        if (typeOfLeftOperand === compareOperandType.FIELD && left == null && (rightOperand == null || rightOperand !== "null"))
                            break;

                        if (typeOfRightOperand === compareOperandType.FIELD && right == null && (leftOperand == null || leftOperand !== "null"))
                            break;

                        if (isBigDecimalConversion) {
                            let leftBigDecimal = Constraint.objectCastToBigDecimal(left, leftOperand, typeOfLeftOperand);
                            let rightBigDecimal = Constraint.objectCastToBigDecimal(right, rightOperand, typeOfRightOperand);

                            if (((indxOperator === EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) === 0)) ||
                                ((indxOperator === NOT_EQUAL) && (leftBigDecimal.cmp(rightBigDecimal) !== 0)))
                                ret = true;

                        } else if (((left != null) && left instanceof HashId) ||
                            ((right != null) && right instanceof HashId)) {
                            let leftID;
                            let rightID;

                            if ((left != null) && left instanceof HashId)
                                leftID = left;
                            else if ((left != null) && typeof left === "string")
                                leftID = HashId.withBase64Digest(left);
                            else
                                leftID = HashId.withBase64Digest(leftOperand);

                            if ((right != null) && right instanceof HashId)
                                rightID = right;
                            else if ((right != null) && typeof right === "string")
                                rightID = HashId.withBase64Digest(right);
                            else
                                rightID = HashId.withBase64Digest(rightOperand);

                            ret = leftID.equals(rightID);

                            if (indxOperator === NOT_EQUAL)
                                ret = !ret;

                        } else if (((left != null) && left instanceof roles.Role) || ((right != null) && right instanceof roles.Role)) { // if role - compare with role, key or address
                            if (((left != null) && left instanceof roles.Role) && ((right != null) && right instanceof roles.Role)) {

                                let leftRole = Constraint.prepareRoleToComparison(left);
                                let rightRole = Constraint.prepareRoleToComparison(right);

                                if (((indxOperator === NOT_EQUAL) && !leftRole.equalsForConstraint(rightRole)) ||
                                    ((indxOperator === EQUAL) && leftRole.equalsForConstraint(rightRole)))
                                    ret = true;

                            } else {
                                let role;
                                let compareOperand;
                                if ((left != null) && left instanceof roles.Role) {
                                    role = left;
                                    if ((right != null) && (typeof right === "string"))
                                        compareOperand = right;
                                    else
                                        compareOperand = rightOperand;
                                } else {
                                    role = right;
                                    if ((left != null) && (typeof left === "string"))
                                        compareOperand = left;
                                    else
                                        compareOperand = leftOperand;
                                }

                                role = Constraint.prepareRoleToComparison(role);
                                let compareRole = Constraint.prepareRoleToComparison(compareOperand);

                                ret = role.equalsForConstraint(compareRole);

                                if (indxOperator === NOT_EQUAL)
                                    ret = !ret;
                            }

                        } else if (((left != null) && left instanceof Date) ||
                            ((right != null) && right instanceof Date)) {
                            let leftTime = Constraint.objectCastToTimeSeconds(left, leftOperand, typeOfLeftOperand);
                            let rightTime = Constraint.objectCastToTimeSeconds(right, rightOperand, typeOfRightOperand);

                            if (((indxOperator === NOT_EQUAL) && (leftTime !== rightTime)) ||
                                ((indxOperator === EQUAL) && (leftTime === rightTime)))
                                ret = true;

                        }  else if (left instanceof Constraint && right instanceof Constraint) {
                            ret = indxOperator === (left.equalsIgnoreType(right) ? EQUAL : NOT_EQUAL);

                        } else if ((left != null && typeof left === "object" && left.hasOwnProperty("contractForSearchByTag")) ||
                            (right != null && typeof right === "object" && right.hasOwnProperty("contractForSearchByTag"))) {

                            let taggedContract = null;
                            let tag = null;

                            if (left != null && typeof left === "object" && left.hasOwnProperty("contractForSearchByTag")) {
                                if (left.contractForSearchByTag instanceof Contract && (right == null || typeof right === "string")) {
                                    taggedContract = left.contractForSearchByTag;

                                    if (right != null && typeof right ==="string")
                                        tag = right;
                                    else
                                        tag = rightOperand;
                                }
                            } else {
                                if (right.contractForSearchByTag instanceof Contract && (left == null || typeof left === "string")) {
                                    taggedContract = right.contractForSearchByTag;

                                    if (left != null && typeof left === "string")
                                        tag = left;
                                    else
                                        tag = leftOperand;
                                }
                            }

                            if (taggedContract == null || tag == null)
                                throw new ex.IllegalArgumentError("Incorrect operands for search by tag");

                            let foundedContract = taggedContract.transactionPack.taggedItems.get(tag);

                            let equals = foundedContract != null && foundedContract.id.equals(taggedContract.id);

                            ret = indxOperator === (equals ? EQUAL : NOT_EQUAL);

                        } else if ((typeOfLeftOperand === compareOperandType.FIELD) && (typeOfRightOperand === compareOperandType.FIELD)) {   // operands is FIELDs
                            if ((left != null) && (right != null)) {
                                if ((indxOperator === NOT_EQUAL && left !== right) ||
                                    (indxOperator === EQUAL && left === right))
                                    ret = true;
                            }

                        } else {
                            let field;
                            let compareOperand;
                            let typeCompareOperand;
                            if (typeOfLeftOperand === compareOperandType.FIELD) {
                                field = left;
                                compareOperand = rightOperand;
                                typeCompareOperand = typeOfRightOperand;
                            } else if (typeOfRightOperand === compareOperandType.FIELD) {
                                field = right;
                                compareOperand = leftOperand;
                                typeCompareOperand = typeOfLeftOperand;
                            } else
                                throw new ex.IllegalArgumentError("At least one operand must be a field");

                            if (typeCompareOperand === compareOperandType.CONSTOTHER) {         // compareOperand is CONSTANT (null|number|true|false)
                                if (compareOperand !== "null" && compareOperand !== "false" && compareOperand !== "true") {
                                    if (field != null && (typeof field === "number")) {
                                        ret = (field === parseFloat(compareOperand));
                                        if (indxOperator === NOT_EQUAL)
                                            ret = !ret;
                                    }
                                } else {          // if compareOperand : null|false|true
                                    if ((indxOperator === NOT_EQUAL &&
                                        ((compareOperand === "null" && field != null) ||
                                            (compareOperand === "true" && typeof field === "boolean" && !field) ||
                                            (compareOperand === "false" && typeof field === "boolean" && field)))
                                        || (indxOperator === EQUAL &&
                                            ((compareOperand === "null" && field == null) ||
                                                (compareOperand === "true" && typeof field === "boolean" && field) ||
                                                (compareOperand === "false" && typeof field === "boolean" && !field))))
                                        ret = true;
                                }
                            } else if (typeCompareOperand === compareOperandType.CONSTSTR) {          // compareOperand is CONSTANT (string)
                                if (field != null &&
                                    ((indxOperator === NOT_EQUAL && field !== compareOperand) ||
                                        (indxOperator === EQUAL && field === compareOperand)))
                                    ret = true;
                            } else
                                throw new ex.IllegalArgumentError("Invalid type of operand: " + compareOperand);
                        }

                        break;

                    case MATCHES:

                        break;
                    case IS_INHERIT:
// deprecate warning
                        console.log("WARNING: Operator 'is_inherit' was deprecated. Use operator 'is_a'.");
                    case IS_A:
                        if (left == null || !(left instanceof Constraint))
                            throw new ex.IllegalArgumentError("Expected constraint in condition in left operand: " + leftOperand);

                        if (right == null || !(right instanceof Constraint))
                            throw new ex.IllegalArgumentError("Expected constraint in condition in right operand: " + rightOperand);

                        ret = left.isInherited(right, refContract, contracts, iteration + 1);

                        break;
                    case INHERIT:
// deprecate warning
                        console.log("WARNING: Operator 'inherit' was deprecated. Use operator 'inherits'.");
                    case INHERITS:
                        if (right == null || !(right instanceof Constraint))
                            throw new ex.IllegalArgumentError("Expected constraint in condition in right operand: " + rightOperand);
                        ret = right.isMatchingWithIteration(refContract, contracts, iteration + 1);

                        break;
                    case CAN_PLAY:
                        if (right == null)
                            return false;

                        if (!(right instanceof roles.Role))
                            throw new ex.IllegalArgumentError("Expected role in condition in right operand: " + rightOperand);

                        let keys;
                        if (leftOperand === "this")
                            keys = leftOperandContract.effectiveKeys.keys();
                        else
                            keys = leftOperandContract.sealedByKeys.keys();

                        ret = right.requiredAllConstraints.size === 0 && right.requiredAnyConstraints.size === 0 &&
                            right.isAllowedForKeys(keys);

                        break;
                    case IN:
                        if (typeOfLeftOperand === compareOperandType.FIELD && left == null)
                            break;

                        if (typeOfRightOperand === compareOperandType.FIELD && right == null)
                            break;

                        if (!(right instanceof Set || right instanceof t.GenericSet || right instanceof Array))
                            break;

                        let leftSet = new t.GenericSet();
                        let rightSet = new t.GenericSet();

                        if (left == null)
                            leftSet.add(leftOperand);
                        else if (left instanceof Set || left instanceof t.GenericSet || left instanceof Array)
                            left.forEach(item => leftSet.add(item));
                        else
                            leftSet.add(left);

                        if (leftSet.size === 0) {
                            ret = true;
                            break;
                        }

                        right.forEach(item => rightSet.add(item));

                        if (Array.from(leftSet).some(item => item instanceof HashId) ||
                            Array.from(rightSet).some(item => item instanceof HashId)) {

                            let leftHashSet = new t.GenericSet();
                            let rightHashSet = new t.GenericSet();

                            for (let item of leftSet) {
                                if (item instanceof HashId)
                                    leftHashSet.add(item);
                                else if (typeof item === "string")
                                    leftHashSet.add(HashId.withBase64Digest(item));
                                else
                                    throw new ex.IllegalArgumentError("Unexpected type (expect HashId or String) of " +
                                        "collection item in left operand in condition: " + leftOperand);
                            }

                            for (let item of rightSet) {
                                if (item instanceof HashId)
                                    rightHashSet.add(item);
                                else if (typeof item === "string")
                                    rightHashSet.add(HashId.withBase64Digest(item));
                                else
                                    throw new ex.IllegalArgumentError("Unexpected type (expect HashId or String) of " +
                                        "collection item in right operand in condition: " + rightOperand);
                            }

                            ret = Array.from(leftHashSet).every(hash => rightHashSet.has(hash));

                        } else if (Array.from(leftSet).some(item => item instanceof roles.Role) ||
                                   Array.from(rightSet).some(item => item instanceof roles.Role)) {

                            let leftRoleSet = new t.GenericSet();
                            let rightRoleSet = new t.GenericSet();

                            for (let item of leftSet) {
                                if (item instanceof roles.Role || typeof item === "string")
                                    leftRoleSet.add(Constraint.prepareRoleToComparison(item));
                                else
                                    throw new ex.IllegalArgumentError(
                                        "Unexpected type (expect Role or String) of collection item in left operand in condition: " + leftOperand);
                            }

                            for (let item of rightSet) {
                                if (item instanceof roles.Role || typeof item === "string")
                                    rightRoleSet.add(Constraint.prepareRoleToComparison(item));
                                else
                                    throw new ex.IllegalArgumentError(
                                        "Unexpected type (expect Role or String) of collection item in right operand in condition: " + rightOperand);
                            }

                            ret = Array.from(leftRoleSet).every(leftRole =>
                                  Array.from(rightRoleSet).some(rightRole =>
                                      leftRole.equalsForConstraint(rightRole)));

                        } else if (Array.from(leftSet).every(item => item instanceof Constraint) &&
                                   Array.from(rightSet).every(item => item instanceof Constraint)) {

                            ret = Array.from(leftSet).every(leftConstr =>
                                  Array.from(rightSet).some(rightConstr =>
                                      leftConstr.equalsIgnoreType(rightConstr)));

                        } else
                            ret = Array.from(leftSet).every(leftItem => rightSet.has(leftItem));

                        break;
                    default:
                        throw new ex.IllegalArgumentError("Invalid operator in condition");
                }
            } catch (e){
                throw new ex.IllegalArgumentError("Error compare operands in condition: " + e.toString());
            }
        } else {       // if rightOperand == null && rightExpression == null, then operation: defined / undefined
            if (indxOperator === DEFINED) {
                try {
                    if (leftOperandContract.get(leftOperand) != null)
                        ret = true;
                } catch (e) {}
            } else if (indxOperator === UNDEFINED) {
                try {
                    ret = (leftOperandContract.get(leftOperand) == null);
                } catch (e) {
                    ret = true;
                }
            } else
                throw new ex.IllegalArgumentError("Invalid operator in condition");
        }

        return ret;
    }

    static isFieldOperand(operand) {
        let firstPointPos;
        return ((firstPointPos = operand.indexOf(".")) > 0) &&
            (operand.length > firstPointPos + 1) &&
            ((operand.charAt(firstPointPos + 1) < '0') ||
             (operand.charAt(firstPointPos + 1) > '9'));
    }

    isExpression(operand) {
        if (this.baseContract == null)
            console.log("WARNING: Need base contract to check API level. Capabilities API level 4 and above disabled.");

        return this.baseContract != null && this.baseContract.apiLevel >= 4 &&
            operations.some((op, i) => operand.includes(op) && (i !== MINUS || operand.lastIndexOf(op) > 0)) ||
            roundOperations.some(op => operand.startsWith(op));
    }

    static countCommonParentheses(expression) {
        let commonLevel = 0;
        while (expression.charAt(commonLevel) === '(')
            commonLevel++;

        if (commonLevel === 0)
            return 0;

        let pos = commonLevel;
        let level = commonLevel;
        while (pos < expression.length - commonLevel) {
            if (expression.charAt(pos) === '(')
                level++;

            if (expression.charAt(pos) === ')') {
                level--;
                if (level === 0)
                    return 0;

                if (level < commonLevel)
                    commonLevel = level;
            }

            pos++;
        }

        if (commonLevel > 0) {
            if (commonLevel !== level)
                throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Expected ')'.");

            while (pos < expression.length) {
                if (expression.charAt(pos) !== ')')
                    throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Expected ')'.");
                pos++;
            }
        }

        return commonLevel;
    }

    static isTopLevelOperation(expression, opPos) {
        let pos = 0;
        let level = 0;
        while (pos < expression.length) {
            if (pos === opPos)
                return level === 0;

            if (expression.charAt(pos) === '(')
                level++;

            if (expression.charAt(pos) === ')') {
                level--;
                if (level < 0)
                    throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Not expected ')'.");
            }

            pos++;
        }

        throw new ex.IllegalArgumentError("Internal parsing error in expression: " + expression + ". opPos not reached.");
    }

    parseExpression(expression, topLevel) {
        if (topLevel) {
            // remove top-level parentheses
            let countParentheses = Constraint.countCommonParentheses(expression);
            if (countParentheses > 0)
                expression = expression.substring(countParentheses, expression.length - countParentheses);
        }

        let opPos = -1;
        let i = -1;
        let opLen = 1;
        do {
            i++;
            while ((opPos = expression.indexOf(operations[i], opPos + 1)) > 0 && !Constraint.isTopLevelOperation(expression, opPos));
        } while (opPos <= 0 && i < DIV);

        if (opPos <= 0) {
            // parse round operations
            for (i = ROUND; i <= CEIL; i++)
                if (expression.startsWith(roundOperations[i - ROUND_OPERATIONS])) {
                    if (!expression.endsWith(")"))
                        throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Not expected ')' after rounding operation.");
                    expression = expression.substring(roundOperations[i - ROUND_OPERATIONS].length, expression.length - 1);
                    while ((opPos = expression.indexOf(",", opPos + 1)) > 0 && !Constraint.isTopLevelOperation(expression, opPos));
                    if (opPos <= 0)
                        throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Not expected ',' after rounding operation.");
                    break;
                }
            if (i > CEIL)
                throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Not found top-level operation.");
        }
        else
            opLen = operations[i].length;


        let leftOperand = expression.substring(0, opPos);
        if (leftOperand.length === 0)
            throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Missing left operand.");

        let typeLeftOperand = compareOperandType.CONSTOTHER;
        let leftParentheses = false;

        let countParentheses = Constraint.countCommonParentheses(leftOperand);
        if (countParentheses > 0) {
            leftOperand = leftOperand.substring(countParentheses, leftOperand.length - countParentheses);
            leftParentheses = true;
        }

        if (this.isExpression(leftOperand)) {
            leftOperand = this.parseExpression(leftOperand, false);
            typeLeftOperand = compareOperandType.EXPRESSION;
        } else if (Constraint.isFieldOperand(leftOperand))
            typeLeftOperand = compareOperandType.FIELD;

        let rightOperand = expression.substring(opPos + opLen);
        if (rightOperand.length === 0)
            throw new ex.IllegalArgumentError("Invalid format of expression: " + expression + ". Missing right operand.");

        let typeRightOperand = compareOperandType.CONSTOTHER;
        let rightParentheses = false;

        countParentheses = Constraint.countCommonParentheses(rightOperand);
        if (countParentheses > 0) {
            rightOperand = rightOperand.substring(countParentheses, rightOperand.length - countParentheses);
            rightParentheses = true;
        }

        if (this.isExpression(rightOperand)) {
            rightOperand = this.parseExpression(rightOperand, false);
            typeRightOperand = compareOperandType.EXPRESSION;
        } else if (Constraint.isFieldOperand(rightOperand))
            typeRightOperand = compareOperandType.FIELD;

        let leftConversion = NO_CONVERSION;
        let rightConversion = NO_CONVERSION;

        if ((typeLeftOperand === compareOperandType.FIELD) && (leftOperand.endsWith("::number"))) {
            leftConversion = CONVERSION_BIG_DECIMAL;
            leftOperand = leftOperand.substring(0, leftOperand.length - 8);
        }

        if ((typeRightOperand === compareOperandType.FIELD) && (rightOperand.endsWith("::number"))) {
            rightConversion = CONVERSION_BIG_DECIMAL;
            rightOperand = rightOperand.substring(0, rightOperand.length - 8);
        }

        return {
            operation: i,
            leftOperand: leftOperand,
            rightOperand: rightOperand,
            typeOfLeftOperand: typeLeftOperand,
            typeOfRightOperand: typeRightOperand,
            leftConversion: leftConversion,
            rightConversion: rightConversion,
            leftParentheses: leftParentheses,
            rightParentheses: rightParentheses
        };
    }

    /**
     * Parse string condition.
     *
     * @param {string} condition - Condition string.
     * @return {object} - Object with condition parameters.
     * @throws Invalid format of condition.
     */
    parseCondition(condition) {

        let leftConversion = NO_CONVERSION;
        let rightConversion = NO_CONVERSION;

        for (let i = 0; i < 2; i++) {
            let operPos = condition.lastIndexOf(operators[i]);

            if ((operPos >= 0) && (condition.length - operators[i].length === operPos)) {

                let leftOperand = condition.substring(0, operPos).replace(/\s/g, "");

                if (leftOperand.endsWith("::number")) {
                    leftConversion = CONVERSION_BIG_DECIMAL;
                    leftOperand = leftOperand.substring(0, leftOperand.length - 8);
                }

                return {
                    operator: i,
                    leftOperand: leftOperand,
                    rightOperand: null,
                    typeOfLeftOperand: compareOperandType.FIELD,
                    typeOfRightOperand: compareOperandType.CONSTOTHER,
                    leftConversion: leftConversion,
                    rightConversion: rightConversion
                };
            }
        }

        for (let i = LESS_OR_EQUAL; i <= IN; i++) {
            if (i >= INHERITS && i <= CAN_PLAY)     // skipping operators with a different syntax
                continue;

            let operPos = condition.indexOf(operators[i]);
            let firstMarkPos = condition.indexOf("\"");
            let lastMarkPos = condition.lastIndexOf("\"");

            // Normal situation - operator without quotes
            while ((operPos > firstMarkPos) && (firstMarkPos >= 0) && (operPos < lastMarkPos))
                operPos = condition.indexOf(operators[i], operPos + 1);

            // Operator not found
            if (operPos < 0)
                continue;

            // Parsing left operand
            let subStrL = condition.substring(0, operPos);
            if (subStrL.length === 0)
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing left operand.");
            let lmarkPos1 = subStrL.indexOf("\"");
            let lmarkPos2 = subStrL.lastIndexOf("\"");

            if ((lmarkPos1 >= 0) && (lmarkPos1 === lmarkPos2))
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Only one quote is found for left operand.");

            let leftOperand;
            let typeLeftOperand = compareOperandType.CONSTOTHER;

            if ((lmarkPos1 >= 0) && (lmarkPos1 !== lmarkPos2)) {
                leftOperand = subStrL.substring(lmarkPos1 + 1, lmarkPos2);
                typeLeftOperand = compareOperandType.CONSTSTR;
            } else {
                leftOperand = subStrL.replace(/\s/g, "");

                if (this.isExpression(leftOperand)) {
                    if (i > EQUAL)
                        throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Operator incompatible with expression in left operand.");

                    leftOperand = this.parseExpression(leftOperand, true);
                    typeLeftOperand = compareOperandType.EXPRESSION;
                } else if (Constraint.isFieldOperand(leftOperand))
                    typeLeftOperand = compareOperandType.FIELD;
            }

            // Parsing right operand
            let subStrR = condition.substring(operPos + operators[i].length);
            if (subStrR.length === 0)
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing right operand.");

            let rmarkPos1 = subStrR.indexOf("\"");
            let rmarkPos2 = subStrR.lastIndexOf("\"");

            if ((rmarkPos1 >= 0) && (rmarkPos1 === rmarkPos2))
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Only one quote is found for right operand.");

            let rightOperand;
            let typeRightOperand = compareOperandType.CONSTOTHER;

            if ((rmarkPos1 >= 0) && (rmarkPos1 !== rmarkPos2)) {
                rightOperand = subStrR.substring(rmarkPos1 + 1, rmarkPos2);
                typeRightOperand = compareOperandType.CONSTSTR;
            } else {
                rightOperand = subStrR.replace(/\s/g, "");

                if (this.isExpression(rightOperand)) {
                    if (i > EQUAL)
                        throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Operator incompatible with expression in right operand.");

                    rightOperand = this.parseExpression(rightOperand, true);
                    typeRightOperand = compareOperandType.EXPRESSION;
                } else if (Constraint.isFieldOperand(rightOperand))
                    typeRightOperand = compareOperandType.FIELD;
            }

            if ((typeLeftOperand === compareOperandType.FIELD) && (leftOperand.endsWith("::number"))) {
                leftConversion = CONVERSION_BIG_DECIMAL;
                leftOperand = leftOperand.substring(0, leftOperand.length - 8);
            }

            if ((typeRightOperand === compareOperandType.FIELD) && (rightOperand.endsWith("::number"))) {
                rightConversion = CONVERSION_BIG_DECIMAL;
                rightOperand = rightOperand.substring(0, rightOperand.length - 8);
            }

            return {
                operator: i,
                leftOperand: leftOperand,
                rightOperand: rightOperand,
                typeOfLeftOperand: typeLeftOperand,
                typeOfRightOperand: typeRightOperand,
                leftConversion: leftConversion,
                rightConversion: rightConversion
            };
        }

        for (let i = INHERITS; i <= INHERIT; i++) {
            let operPos = condition.indexOf(operators[i]);

            if ((operPos === 0) || ((operPos > 0) && (condition.charAt(operPos - 1) !== '_'))) {
                let subStrR = condition.substring(operPos + operators[i].length);
                if (subStrR.length === 0)
                    throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing right operand.");

                let rightOperand = subStrR.replace(/\s/g, "");

                if (rightOperand.endsWith("::number")) {
                    rightConversion = CONVERSION_BIG_DECIMAL;
                    rightOperand = rightOperand.substring(0, rightOperand.length - 8);
                }

                return {
                    operator: i,
                    leftOperand: null,
                    rightOperand: rightOperand,
                    typeOfLeftOperand: compareOperandType.FIELD,
                    typeOfRightOperand: compareOperandType.FIELD,
                    leftConversion: leftConversion,
                    rightConversion: rightConversion
                };
            }
        }

        let operPos = condition.indexOf(operators[CAN_PLAY]);
        if (operPos > 0) {
            // Parsing left operand
            let subStrL = condition.substring(0, operPos);
            if (subStrL.length === 0)
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing left operand.");

            let leftOperand = subStrL.replace(/\s/g, "");
            if (~leftOperand.indexOf("."))
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Left operand must be a constraint to a contract.");

            let subStrR = condition.substring(operPos + operators[CAN_PLAY].length);
            if (subStrR.length === 0)
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing right operand.");

            // Parsing right operand
            let rightOperand = subStrR.replace(/\s/g, "");
            let firstPointPos;
            if (!(((firstPointPos = rightOperand.indexOf(".")) > 0) &&
                (rightOperand.length > firstPointPos + 1) &&
                ((rightOperand.charAt(firstPointPos + 1) < '0') ||
                    (rightOperand.charAt(firstPointPos + 1) > '9'))))
                throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Right operand must be a role field.");

            return {
                operator: CAN_PLAY,
                leftOperand: leftOperand,
                rightOperand: rightOperand,
                typeOfLeftOperand: compareOperandType.CONSTOTHER,
                typeOfRightOperand: compareOperandType.FIELD,
                leftConversion: leftConversion,
                rightConversion: rightConversion
            };
        }

        throw new ex.IllegalArgumentError("Invalid format of condition: " + condition);
    }

    /**
     * Pre-parsing conditions of constraint
     *
     * @param {object} conditions - Is object with not-parsed (string) conditions.
     * @return {object} Object with parsed conditions.
     * @throws Expected all_of or any_of.
     */
    parseConditions(conditions) {

        if (conditions == null || Object.entries(conditions).length === 0)
            return {};

        if (conditions.hasOwnProperty("operator"))
            return conditions;

        let all = conditions.hasOwnProperty(Constraint.conditionsModeType.all_of);
        let any = conditions.hasOwnProperty(Constraint.conditionsModeType.any_of);

        if (all || any) {
            let result = {};
            let keyName = all ? Constraint.conditionsModeType.all_of : Constraint.conditionsModeType.any_of;
            let parsedList = [];
            let condList = conditions[keyName];

            if (condList == null)
                throw new ex.IllegalArgumentError("Expected all_of or any_of conditions");
            for (let item of condList) {
                if (typeof item === "string")
                    parsedList.push(this.parseCondition(item));
                else {
                    let parsed = this.parseConditions(item);
                    if ((parsed != null) && (parsed !== {}))
                        parsedList.push(parsed);
                }
            }

            result[keyName] = parsedList;
            return result;
        } else
            throw new ex.IllegalArgumentError("Expected all_of or any_of");
    }

    /**
     * Check condition of constraint.
     *
     * @param {string|object} condition - Condition to check for matching.
     * @param {Contract} ref - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contract list to check for matching.
     * @param {number} iteration - Check inside constraints iteration number.
     * @return {boolean} true if match or false.
     */
    checkCondition(condition, ref, contracts, iteration) {

        if (typeof condition === "string")
            condition = this.parseCondition(condition);

        return this.compareOperands(ref, condition.leftOperand, condition.rightOperand,
            condition.typeOfLeftOperand, condition.typeOfRightOperand,
            (condition.leftConversion === CONVERSION_BIG_DECIMAL) ||
            (condition.rightConversion === CONVERSION_BIG_DECIMAL),
            condition.operator, contracts, iteration);
    }

    /**
     * Check conditions of constraint.
     *
     * @param {object} conditions - Object with conditions to check for matching.
     * @param {Contract} ref - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contract list to check for matching.
     * @param {number} iteration - Check inside constraints iteration number.
     * @return {boolean} true if match or false.
     */
    checkConditions(conditions, ref, contracts, iteration) {

        let result;
        if (conditions == null || Object.entries(conditions).length === 0)
            return true;

        if (conditions.hasOwnProperty(Constraint.conditionsModeType.all_of)) {
            let condList = conditions[Constraint.conditionsModeType.all_of];

            if (condList == null)
                throw new ex.IllegalArgumentError("Expected all_of conditions");

            result = true;
            for (let item of condList)
                if (typeof item === "string")
                    result = result && this.checkCondition(item, ref, contracts, iteration);
                else
                    result = result && this.checkConditions(item, ref, contracts, iteration);

        } else if (conditions.hasOwnProperty(Constraint.conditionsModeType.any_of)) {
            let condList = conditions[Constraint.conditionsModeType.any_of];

            if (condList == null)
                throw new ex.IllegalArgumentError("Expected any_of conditions");

            result = false;
            for (let item of condList)
                if (typeof item === "string")
                    result = result || this.checkCondition(item, ref, contracts, iteration);
                else
                    result = result || this.checkConditions(item, ref, contracts, iteration);

        } else if (conditions.hasOwnProperty("operator"))
            result = this.checkCondition(conditions, ref, contracts, iteration);
        else
            throw new ex.IllegalArgumentError("Expected all_of or any_of");

        return result;
    }

    /**
     * Add the matching item for the constraint.
     *
     * @param {Contract} a - Contract to add to matching items.
     * @return {void}
     */
    addMatchingItem(a) {
        this.matchingItems.add(a);
    }

    /**
     * Check if condition is valid i.e. have matching with criteria items.
     *
     * @return {boolean} true or false.
     */
    isValid() {
        return this.matchingItems.size > 0;
    }

    /**
     * Check if given item matching with current constraint criteria.
     *
     * @param {Contract} contract - Contract item to check for matching.
     * @param {Set<Contract>} contracts - Contract list to check for matching.
     * @return {boolean} true if match or false.
     */
    isMatchingWith(contract, contracts) {
        return this.isMatchingWithIteration(contract, contracts, 0);
    }

    /**
     * Check if given item matching with current constraint criteria.
     *
     * @param {Contract} contract - Contract item to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @private
     * @return {boolean} true if match or false.
     * @throws Recursive checking constraint have more 16 iterations.
     */
    isMatchingWithIteration(contract, contracts, iteration) {
        //todo: add this checking for matching with given item

        if (iteration > 16)
            throw new ex.IllegalArgumentError("Recursive checking constraints have more 16 iterations");

        let result = true;

        //check roles
        if (result) {
            if (this.roles.length !== 0) {
                result = false;
                for (let i = 0; i < this.roles.length; i++)
                    if (contract.roles.hasOwnProperty(this.roles[i])) {
                        result = true;
                        break;
                    }
            }
        }

        //check origin
        if (result)
            result = (this.origin == null || !(contract.getOrigin().equals(this.origin)));

        //check fields
        if (result) {
            if ((this.fields.length !== 0) && (contract.state != null) && (contract.state.data != null)) {
                result = false;
                for (let i = 0; i < this.fields.length; i++)
                    if (contract.state.data.hasOwnProperty(this.fields[i])) {
                        result = true;
                        break;
                    }
            }
        }

        //check conditions
        if (result)
            result = this.checkConditions(this.conditions, contract, contracts, iteration);

        return result;
    }

    /**
     * Check whether a constraint inherits a condition from the specified constraint.
     *
     * @param {Constraint} constr - Constraint for finding in inherits condition.
     * @param {Contract} constrContract - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @return {boolean} true if inherited or false.
     */
    isInherited(constr, constrContract, contracts, iteration) {
        return this.isInheritedConditions(this.conditions, constr, constrContract, contracts, iteration);
    }

    /**
     * Check whether a constraint inherits a conditions from the specified constraint.
     *
     * @param {object} conditions - Object with conditions.
     * @param {Constraint} constr - Constraint for finding in inherits condition.
     * @param {Contract} constrContract - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @return {boolean} true if inherited or false.
     */
    isInheritedConditions(conditions, constr, constrContract, contracts, iteration) {

        if (conditions == null || Object.entries(conditions).length === 0)
            return false;

        let condList = null;
        if (conditions.hasOwnProperty(Constraint.conditionsModeType.all_of)) {
            condList = conditions[Constraint.conditionsModeType.all_of];
            if (condList == null)
                throw new ex.IllegalArgumentError("Expected all_of conditions");

        } else if (conditions.hasOwnProperty(Constraint.conditionsModeType.any_of)) {
            condList = conditions[Constraint.conditionsModeType.any_of];
            if (condList == null)
                throw new ex.IllegalArgumentError("Expected any_of conditions");

        } else if (conditions.hasOwnProperty("operator"))
            return this.isInheritedParsed(conditions, constr, constrContract, contracts, iteration);
        else
            throw new ex.IllegalArgumentError("Expected all_of or any_of");

        if (condList != null)
            for (let item of condList)
                if (typeof item === "string") {
                    if (this.isInheritedCondition(item, constr, constrContract, contracts, iteration))
                        return true;
                } else if (this.isInheritedConditions(item, constr, constrContract, contracts, iteration))
                    return true;

        return false;
    }

    /**
     * Checks whether a condition is a condition of inheritance.
     *
     * @param {object} condition - Object with conditions.
     * @param {Constraint} constr - Constraint for finding in inherits condition.
     * @param {Contract} constrContract - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @return {boolean} true if inherited or false.
     */
    isInheritedParsed(condition, constr, constrContract, contracts, iteration) {

        if (((condition.operator === INHERITS) || (condition.operator === INHERIT)) && (condition.rightOperand != null))
            return this.isInheritedOperand(condition.rightOperand, constr, constrContract, contracts, iteration);

        return false;
    }

    /**
     * Checks if a condition is a condition of inheritance if the condition is not yet parsed.
     *
     * @param {object} condition - Object with conditions.
     * @param {Constraint} constr - Constraint for finding in inherits condition.
     * @param {Contract} constrContract - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @return {boolean} true if inherited or false.
     * @throws Invalid format of condition
     */
    isInheritedCondition(condition, constr, constrContract, contracts, iteration) {

        for (let i = INHERITS; i <= INHERIT; i++) {
            let operPos = condition.indexOf(operators[i]);

            if ((operPos === 0) || ((operPos > 0) && (condition.charAt(operPos - 1) !== '_'))) {
                let subStrR = condition.substring(operPos + operators[i].length);
                if (subStrR.length === 0)
                    throw new ex.IllegalArgumentError("Invalid format of condition: " + condition + ". Missing right operand.");

                let rightOperand = subStrR.replace(/\s/g, "");

                return this.isInheritedOperand(rightOperand, constr, constrContract, contracts, iteration);
            }
        }

        return false;
    }

    /**
     * Checks the operand of the inheritance condition for compliance with the specified constraint.
     *
     * @param {string} rightOperand - Operand of the inheritance condition.
     * @param {Constraint} constr - Constraint for finding in inherits condition.
     * @param {Contract} constrContract - Contract to check for matching.
     * @param {Set<Contract>} contracts - Contracts list to check for matching.
     * @param {number} iteration - Iteration check inside constraints iteration number.
     * @return {boolean} true if inherited or false.
     * @throws Invalid format of condition.
     */
    isInheritedOperand(rightOperand, constr, constrContract, contracts, iteration) {

        let rightOperandContract = null;
        let right = null;
        let firstPointPos;

        if (rightOperand.startsWith("ref.")) {
            rightOperand = rightOperand.substring(4);
            rightOperandContract = constrContract;
        } else if (rightOperand.startsWith("this.")) {
            if (this.baseContract == null)
                throw new ex.IllegalArgumentError("Use right operand in condition: " + rightOperand + ". But this contract not initialized.");

            rightOperand = rightOperand.substring(5);
            rightOperandContract = this.baseContract;
        } else if ((firstPointPos = rightOperand.indexOf(".")) > 0) {
            if (this.baseContract == null)
                throw new ex.IllegalArgumentError("Use right operand in condition: " + rightOperand + ". But this contract not initialized.");

            let constr = this.baseContract.findConstraintByName(rightOperand.substring(0, firstPointPos));
            if (constr == null)
                throw new ex.IllegalArgumentError("Not found constraint: " + rightOperand.substring(0, firstPointPos));

            for (let checkedContract of contracts)
                if (constr.isMatchingWithIteration(checkedContract, contracts, iteration + 1))
                    rightOperandContract = checkedContract;

            if (rightOperandContract == null)
                return false;

            rightOperand = rightOperand.substring(firstPointPos + 1);
        } else
            throw new ex.IllegalArgumentError("Invalid format of right operand in condition: " + rightOperand + ". Missing contract field.");

        if (rightOperandContract != null)
            right = rightOperandContract.get(rightOperand);

        if ((right == null) || !(right instanceof Constraint))
            throw new ex.IllegalArgumentError("Expected constraint in condition in right operand: " + rightOperand);

        return right.equals(constr);
    }

    /**
     * Assembly expression of reference condition.
     *
     * @param {object} expression - Object of parsed expression.
     * @return {string|null} result with assembled expression.
     */
    static assemblyExpression(expression) {

        let result = "";

        // assembly expression
        if (expression.leftParentheses)
            result += "(";

        if (expression.operation >= ROUND_OPERATIONS)
            result += roundOperations[expression.operation - ROUND_OPERATIONS];

        if (expression.leftOperand != null) {
            if (typeof expression.leftOperand === "object")
                result += Constraint.assemblyExpression(expression.leftOperand);

            else {
                result += expression.leftOperand;

                if (expression.leftConversion === CONVERSION_BIG_DECIMAL)
                    result += "::number";
            }
        }

        if (expression.leftParentheses)
            result += ")";

        if (expression.operation >= ROUND_OPERATIONS)
            result += ",";
        else
            result += operations[expression.operation];

        if (expression.rightParentheses)
            result += "(";

        if (expression.rightOperand != null) {
            if (typeof expression.rightOperand === "object")
                result += Constraint.assemblyExpression(expression.rightOperand);

            else {
                result += expression.rightOperand;

                if (expression.rightConversion === CONVERSION_BIG_DECIMAL)
                    result += "::number";
            }
        }

        if (expression.operation >= ROUND_OPERATIONS)
            result += ")";

        if (expression.rightParentheses)
            result += ")";

        return result;
    }

    /**
     * Assembly condition of constraint.
     *
     * @param {object} condition - Object of parsed condition.
     * @return {string|null} result with assembled condition.
     */
    static assemblyCondition(condition) {

        if (condition == null || Object.entries(condition).length === 0)
            return null;

        let result = "";

        // assembly condition
        if (condition.leftOperand != null) {
            if (typeof condition.leftOperand === "object")
                result += Constraint.assemblyExpression(condition.leftOperand);
            else {
                if (condition.typeOfLeftOperand === compareOperandType.CONSTSTR)
                    result += "\"";

                result += condition.leftOperand;

                if (condition.typeOfLeftOperand === compareOperandType.CONSTSTR)
                    result += "\"";

                if (condition.leftConversion === CONVERSION_BIG_DECIMAL)
                    result += "::number";
            }
        }

        result += operators[condition.operator];

        if (condition.rightOperand != null) {
            if (typeof condition.rightOperand ==="object")
                result += Constraint.assemblyExpression(condition.rightOperand);
            else {
                if (condition.typeOfRightOperand === compareOperandType.CONSTSTR)
                    result += "\"";

                result += condition.rightOperand;

                if (condition.typeOfRightOperand === compareOperandType.CONSTSTR)
                    result += "\"";

                if (condition.rightConversion === CONVERSION_BIG_DECIMAL)
                    result += "::number";
            }
        }


        return result;
    }

    /**
     * Assembly conditions of constraint.
     *
     * @param {object} conditions - Object of parsed conditions.
     * @return {object|null} result with assembled (string) conditions.
     * @throws Expected all_of or any_of conditions.
     */
    assemblyConditions(conditions) {

        if (conditions == null || Object.entries(conditions).length === 0)
            return null;

        let all = conditions.hasOwnProperty(Constraint.conditionsModeType.all_of);
        let any = conditions.hasOwnProperty(Constraint.conditionsModeType.any_of);

        if (all || any) {
            let result = {};
            let keyName = all ? Constraint.conditionsModeType.all_of : Constraint.conditionsModeType.any_of;
            let assembledList = [];
            let condList = conditions[keyName];

            if (condList == null)
                throw new ex.IllegalArgumentError("Expected all_of or any_of conditions");

            for (let item of condList) {
                if (typeof item === "string")       // already assembled condition
                    assembledList.push(item);
                else {
                    let assembled = null;
                    if (item.hasOwnProperty("operator"))
                        assembled = Constraint.assemblyCondition(item);
                    else
                        assembled = this.assemblyConditions(item);

                    if (assembled != null)
                        assembledList.push(assembled);
                }
            }

            result[keyName] = assembledList;
            return result;
        } else
            throw new ex.IllegalArgumentError("Expected all_of or any_of");
    }

    getInternalConstraints(iteration = 0) {
        if (iteration > 16)
            throw new ex.IllegalArgumentError("Recursive checking constraints have more 16 iterations");

        return this.getInternalConstraintsFromConditions(this.conditions, iteration);
    }

    getInternalConstraintsFromConditions(conditions, iteration) {
        let constrs = new Set();

        if ((conditions == null) || Object.entries(conditions).length === 0)
            return constrs;

        if (conditions.hasOwnProperty(Constraint.conditionsModeType.all_of)) {
            let condList = conditions[Constraint.conditionsModeType.all_of];
            if (condList == null)
                throw new ex.IllegalArgumentError("Expected all_of conditions");

            for (let item of condList)
                if (typeof item === "string")   // not pre-parsed (old) version
                    this.getInternalConstraintsFromCondition(item, iteration).forEach(c => constrs.add(c));
                else
                    this.getInternalConstraintsFromConditions(item, iteration).forEach(c => constrs.add(c));

        } else if (conditions.hasOwnProperty(Constraint.conditionsModeType.any_of)) {
            let condList = conditions[Constraint.conditionsModeType.any_of];
            if (condList == null)
                throw new ex.IllegalArgumentError("Expected any_of conditions");

            for (let item of condList)
                if (typeof item === "string")   // not pre-parsed (old) version
                    this.getInternalConstraintsFromCondition(item, iteration).forEach(c => constrs.add(c));
                else
                    this.getInternalConstraintsFromConditions(item, iteration).forEach(c => constrs.add(c));

        } else if (conditions.hasOwnProperty("operator"))                                     // pre-parsed version
            this.getInternalConstraintsFromCondition(conditions, iteration).forEach(c => constrs.add(c));
        else
            throw new ex.IllegalArgumentError("Expected all_of or any_of");

        return constrs;
    }

    getInternalConstraintsFromCondition(condition, iteration) {
        if (typeof condition === "string")
            condition = this.parseCondition(condition);

        let constrs = new Set();

        let firstPointPos;
        if (condition.leftOperand != null && condition.typeOfLeftOperand === compareOperandType.FIELD &&
            !condition.leftOperand.startsWith("ref.") && !condition.leftOperand.startsWith("this.") &&
            ((firstPointPos = condition.leftOperand.indexOf(".")) > 0)) {

            if (this.baseContract == null)
                throw new ex.IllegalArgumentError("Use left operand in condition: " + condition.leftOperand + ". But this contract not initialized.");

            let constrName = condition.leftOperand.substring(0, firstPointPos);
            constrs.add(constrName);

            let constr = this.baseContract.findConstraintByName(constrName);
            if (constr != null)
                constr.getInternalConstraints(iteration + 1).forEach(c => constrs.add(c));
        }

        if (condition.rightOperand != null && condition.typeOfRightOperand === compareOperandType.FIELD &&
            !condition.rightOperand.startsWith("ref.") && !condition.rightOperand.startsWith("this.") &&
            ((firstPointPos = condition.rightOperand.indexOf(".")) > 0)) {

            if (this.baseContract == null)
                throw new ex.IllegalArgumentError("Use right operand in condition: " + condition.rightOperand + ". But this contract not initialized.");

            let constrName = condition.rightOperand.substring(0, firstPointPos);
            constrs.add(constrName);

            let constr = this.baseContract.findConstraintByName(constrName);
            if (constr != null)
                constr.getInternalConstraints(iteration + 1).forEach(c => constrs.add(c));
        }

        return constrs;
    }

    toString() {
        return HashId.of(t.randomBytes(64)).base64;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }

    static fromDsl(c, contract) {
        let result = new Constraint(contract);

        if(c.hasOwnProperty("name"))
            result.name = c.name;
        else
            throw "Expected reference name";

        if(c.hasOwnProperty("comment"))
            result.comment = c.comment;

        if(c.hasOwnProperty("where")) {
            let where = {};
            let proto = Object.getPrototypeOf(c.where);
            if (proto === Array.prototype || proto === Set.prototype || proto === t.GenericSet.prototype)
                where[Constraint.conditionsModeType.all_of] = c.where;
            else
                where = c.where;

            result.setConditions(where);
        }

        return result;
    }
}


//TODO: The method allows to mark the contract as matching constraint, bypassing the validation

DefaultBiMapper.registerAdapter(new bs.BiAdapter("Constraint", Constraint));
DefaultBiMapper.registerAdapter(new bs.BiAdapter("Reference", Constraint));     // Constraint proto => Reference

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Constraint};
